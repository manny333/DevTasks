import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createProvider, getAvailableProviders } from '../lib/ai/factory';
import { ensureProjectAccess } from '../lib/access';
import { getDecryptedUserApiKey } from '../lib/userApiKeys';
import { rateLimit } from '../lib/rateLimit';
import { planImport } from '../lib/ai/import/chunking';
import { getImportLimits, ImportLimitError } from '../lib/ai/import/limits';
import { runImportPipeline, toPublicPlan, type ImportContext } from '../lib/ai/import/pipeline';
import type { AIImportSection } from '../lib/ai/types';

const router = Router();
router.use(authMiddleware);

// AI calls are expensive and user-keyed: cap them per user.
router.use(rateLimit({
  windowMs: 5 * 60_000,
  max: 20,
  key: (req) => `ai:${(req as AuthRequest).userId ?? req.ip ?? 'anon'}`,
  message: 'Too many AI requests. Please wait a few minutes and try again.',
}));

// GET /api/ai/providers — list available AI providers (env + user keys)
router.get('/providers', async (req: AuthRequest, res: Response) => {
  const userKeys = await prisma.userApiKey.findMany({
    where: { userId: req.userId!, isActive: true },
    select: { provider: true, label: true },
  });
  res.json(getAvailableProviders(userKeys));
});

// POST /api/ai/plan — token-free preflight: block count, estimated tasks/tokens
router.post('/plan', async (req: AuthRequest, res: Response) => {
  try {
    const { markdown, projectId } = req.body;
    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      res.status(400).json({ error: 'markdown is required' });
      return;
    }
    if (projectId && !await ensureProjectAccess(req.userId!, projectId as string, res, false)) return;
    const limits = getImportLimits();
    const plan = planImport(markdown, limits);
    res.json(toPublicPlan(plan, limits));
  } catch (error) {
    if (!planErrorResponse(res, error)) {
      console.error('AI plan error:', error);
      res.status(500).json({ error: 'Could not plan the import' });
    }
  }
});

// ─── Shared helpers ──────────────────────────────────────────────────

/** Validation error that must reach the client as 4xx, not as a 500. */
class ImportError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Cancels the upstream AI request when the client disconnects or cancels. */
function attachClientAbort(res: Response): AbortController {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) {
      controller.abort();
      console.log('[AI] client disconnected; upstream request aborted');
    }
  });
  return controller;
}

/** DeepSeek defaults to the cheap/fast model for imports; others keep their default. */
function resolveImportModel(provider: string, requested: unknown): string | undefined {
  if (typeof requested === 'string' && requested.trim().length > 0) return requested.trim();
  return provider === 'deepseek' ? 'deepseek-flash' : undefined;
}

async function resolveApiKey(userId: string, provider: string, provided: unknown): Promise<string | undefined> {
  if (typeof provided === 'string' && provided.trim()) return provided;
  const userKey = await getDecryptedUserApiKey(userId, provider);
  if (userKey) return userKey;
  return process.env[`AI_${provider.toUpperCase()}_API_KEY`];
}

async function loadProjectContext(projectId?: string): Promise<ImportContext | undefined> {
  if (!projectId) return undefined;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: { select: { id: true, name: true, color: true } },
      tags: { select: { id: true, name: true, color: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!project) return undefined;
  return {
    sections: project.sections,
    tags: project.tags,
    members: project.members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
    })),
  };
}

function planErrorResponse(res: Response, error: unknown): boolean {
  if (error instanceof ImportLimitError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return true;
  }
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    res.status(status).json({ error: error instanceof Error ? error.message : 'Import failed' });
    return true;
  }
  return false;
}

async function resolveAssignees(preview: AIImportSection[], userId: string) {
  for (const sec of preview) {
    for (const task of sec.tasks) {
      for (const a of task.assignees) {
        const user = await prisma.user.findUnique({ where: { email: a.email }, select: { id: true, name: true } });
        if (user) {
          a.found = true;
          a.userId = user.id;
          a.name = user.name;
        } else {
          a.found = false;
        }
      }
    }
  }
}

// ─── POST /api/ai/preview — non-streaming (kept for compatibility) ──

router.post('/preview', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { markdown, projectId, provider: providerId, model, apiKey, baseUrl, projectName, startDate } = req.body;

    if (projectId && !await ensureProjectAccess(req.userId!, projectId as string, res, false)) return;

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      res.status(400).json({ error: 'markdown is required' });
      return;
    }

    const provider = providerId || 'deepseek';

    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      resolvedApiKey = await getDecryptedUserApiKey(req.userId!, provider);
    }
    if (!resolvedApiKey) {
      resolvedApiKey = process.env[`AI_${provider.toUpperCase()}_API_KEY`];
    }
    if (!resolvedApiKey) {
      res.status(400).json({ error: `No API key configured for ${provider}. Add one in Settings or via environment variable.` });
      return;
    }

    let context: {
      sections?: { id: string; name: string; color: string }[];
      tags?: { id: string; name: string; color: string }[];
      members?: { id: string; name: string; email: string }[];
    } | undefined;

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId as string },
        include: {
          sections: { select: { id: true, name: true, color: true } },
          tags: { select: { id: true, name: true, color: true } },
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      });
      if (project) {
        context = {
          sections: project.sections,
          tags: project.tags,
          members: project.members.map(m => ({ id: m.user.id, name: m.user.name, email: m.user.email })),
        };
      }
    }

    const limits = getImportLimits();
    const plan = planImport(markdown, limits);
    const ai = createProvider(provider, resolvedApiKey, baseUrl);
    const controller = attachClientAbort(res);
    const importModel = resolveImportModel(provider, model);

    const result = await runImportPipeline({
      plan,
      ai,
      limits,
      ...(importModel ? { model: importModel } : {}),
      ...(typeof startDate === 'string' ? { startDate } : {}),
      ...(typeof projectName === 'string' && projectName.trim() ? { projectName: projectName.trim() } : {}),
      signal: controller.signal,
      ...(context ? { context } : {}),
      stream: false,
    });

    if (result.preview.sections.length === 0) {
      res.status(400).json({ error: 'No valid sections could be extracted from the AI response' });
      return;
    }

    await resolveAssignees(result.preview.sections, req.userId!);

    res.json({
      ...result.preview,
      usage: result.usage,
      chunks: result.chunksProcessed,
    });
  } catch (error: any) {
    if (res.destroyed || res.writableEnded) return;
    if (planErrorResponse(res, error)) return;
    console.error('AI preview error:', error);
    const msg = error?.message || 'Internal server error';
    if (msg.includes('not configured') || msg.includes('API key')) {
      res.status(400).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// ─── POST /api/ai/preview/stream — streaming via SSE ──────────────────

router.post('/preview/stream', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { markdown, projectId, provider: providerId, model, apiKey, baseUrl, projectName, startDate } = req.body;

    if (projectId && !await ensureProjectAccess(req.userId!, projectId as string, res, false)) return;

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      res.status(400).json({ error: 'markdown is required' });
      return;
    }

    const provider = providerId || 'deepseek';

    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      resolvedApiKey = await getDecryptedUserApiKey(req.userId!, provider);
    }
    if (!resolvedApiKey) {
      resolvedApiKey = process.env[`AI_${provider.toUpperCase()}_API_KEY`];
    }
    if (!resolvedApiKey) {
      res.status(400).json({ error: `No API key configured for ${provider}. Add one in Settings or via environment variable.` });
      return;
    }

    const limits = getImportLimits();
    const plan = planImport(markdown, limits);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ plan: toPublicPlan(plan, limits) });
    const controller = attachClientAbort(res);

    try {
      const context = await loadProjectContext(typeof projectId === 'string' ? projectId : undefined);
      const ai = createProvider(provider, resolvedApiKey, baseUrl);
      const importModel = resolveImportModel(provider, model);

      const result = await runImportPipeline({
        plan,
        ai,
        limits,
        ...(importModel ? { model: importModel } : {}),
        ...(typeof startDate === 'string' ? { startDate } : {}),
        ...(typeof projectName === 'string' && projectName.trim() ? { projectName: projectName.trim() } : {}),
        signal: controller.signal,
        ...(context ? { context } : {}),
        stream: true,
        ...(plan.chunks.length === 1 ? { onToken: (token: string) => sendEvent({ token }) } : {}),
        onProgress: (progress) => sendEvent({ progress }),
      });

      if (result.preview.sections.length === 0) {
        sendEvent({ error: 'No valid sections could be extracted from the AI response' });
        res.end();
        return;
      }

      await resolveAssignees(result.preview.sections, req.userId!);

      sendEvent({
        done: true,
        preview: { ...result.preview, usage: result.usage },
        usage: result.usage,
        chunks: result.chunksProcessed,
      });
      res.end();
    } catch (innerError: any) {
      if (controller.signal.aborted) {
        res.end();
        return;
      }
      console.error('AI preview stream error:', innerError);
      sendEvent({
        error: innerError?.message || 'Stream generation failed',
        ...(innerError instanceof ImportLimitError ? { code: innerError.code } : {}),
      });
      res.end();
    }
  } catch (error: any) {
    console.error('AI preview stream setup error:', error);
    if (!res.headersSent) {
      if (planErrorResponse(res, error)) return;
      const msg = error?.message || 'Internal server error';
      if (msg.includes('not configured') || msg.includes('API key')) {
        res.status(400).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    } else {
      res.end();
    }
  }
});

// ─── POST /api/ai/apply — create sections, tasks, tags from confirmed preview ──

router.post('/apply', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, preview } = req.body;

    if (!preview || !Array.isArray(preview.sections)) {
      res.status(400).json({ error: 'preview.sections array is required' });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }

    if (!await ensureProjectAccess(req.userId!, projectId as string, res, true)) return;

    const [projectSections, projectMembers] = await Promise.all([
      prisma.section.findMany({ where: { projectId: projectId as string }, select: { id: true } }),
      prisma.projectMember.findMany({ where: { projectId: projectId as string }, select: { userId: true } }),
    ]);
    const validSectionIds = new Set(projectSections.map((section) => section.id));
    const projectMemberIds = new Set(projectMembers.map((member) => member.userId));

    const sections = preview.sections as AIImportSection[];
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    const actorName = actor?.name ?? 'AI Import';

    const SECTION_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#84cc16'];
    const TAG_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#e11d48', '#7c3aed'];

    // The whole import runs in one transaction: a half-imported project is
    // worse than no import, especially when the AI returned hundreds of tasks.
    const created = await prisma.$transaction(async (tx) => {
      let createdSections = 0;
      let createdTasks = 0;
      let createdTags = 0;
      let createdAssignees = 0;

      for (const sec of sections) {
        if (!sec.selected) continue;

        let sectionId: string;

        if (sec.action === 'reuse' && sec.existingSectionId) {
          if (!validSectionIds.has(sec.existingSectionId)) {
            throw new ImportError(400, 'existingSectionId does not belong to this project');
          }
          sectionId = sec.existingSectionId;
        } else {
          const lastSection = await tx.section.findFirst({
            where: { projectId: projectId as string },
            orderBy: { position: 'desc' },
          });
          const newSection = await tx.section.create({
            data: {
              name: sec.name,
              description: sec.description || null,
              color: sec.color || SECTION_COLORS[createdSections % SECTION_COLORS.length],
              position: (lastSection?.position ?? -1) + 1,
              projectId: projectId as string,
            },
          });
          sectionId = newSection.id;
          createdSections++;
        }

        for (const task of sec.tasks ?? []) {
          if (!task.selected || typeof task.title !== 'string' || task.title.trim().length === 0) continue;

          const lastTask = await tx.task.findFirst({
            where: { sectionId, status: 'TODO' },
            orderBy: { position: 'desc' },
          });

          let normalizedDue: Date | null = null;
          if (task.dueDate) {
            const d = new Date(task.dueDate);
            if (!Number.isNaN(d.getTime())) normalizedDue = d;
          }
          let normalizedStart: Date | null = null;
          if (task.startDate) {
            const d = new Date(task.startDate);
            if (!Number.isNaN(d.getTime())) normalizedStart = d;
          }

          const createdTask = await tx.task.create({
            data: {
              title: task.title,
              description: task.description || null,
              startDate: normalizedStart,
              dueDate: normalizedDue,
              status: 'TODO',
              position: (lastTask?.position ?? -1) + 1,
              sectionId,
            },
          });
          createdTasks++;

          const subtasks = task.subtasks ?? [];
          for (let i = 0; i < subtasks.length; i++) {
            const title = typeof subtasks[i].title === 'string' ? subtasks[i].title.trim() : '';
            if (!title) continue;
            await tx.subtask.create({
              data: {
                title,
                position: i,
                taskId: createdTask.id,
              },
            });
          }

          for (const tag of task.tags ?? []) {
            const tagName = typeof tag?.name === 'string' ? tag.name.trim() : '';
            if (!tagName) continue;
            let tagRecord = await tx.tag.findFirst({
              where: { projectId: projectId as string, name: tagName },
            });
            if (!tagRecord) {
              tagRecord = await tx.tag.create({
                data: {
                  name: tagName,
                  color: TAG_COLORS[createdTags % TAG_COLORS.length],
                  projectId: projectId as string,
                },
              });
              createdTags++;
            }
            await tx.taskTag.create({
              data: { taskId: createdTask.id, tagId: tagRecord.id },
            });
          }

          for (const a of task.assignees ?? []) {
            if (!a.found || !a.userId) continue;
            if (!projectMemberIds.has(a.userId)) continue;
            const existing = await tx.taskAssignee.findUnique({
              where: { taskId_userId: { taskId: createdTask.id, userId: a.userId } },
            });
            if (!existing) {
              await tx.taskAssignee.create({
                data: { taskId: createdTask.id, userId: a.userId, accessType: 'VIEWER' },
              });
              createdAssignees++;
            }
          }
        }
      }

      return { sections: createdSections, tasks: createdTasks, tags: createdTags, assignees: createdAssignees };
    }, { maxWait: 10_000, timeout: 120_000 });

    res.json({ success: true, created });
  } catch (error: any) {
    if (error instanceof ImportError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('AI apply error:', error);
    res.status(500).json({ error: 'AI import failed' });
  }
});

export default router;
