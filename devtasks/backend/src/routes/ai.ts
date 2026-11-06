import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createProvider, getAvailableProviders } from '../lib/ai/factory';
import { ensureProjectAccess } from '../lib/access';
import { getDecryptedUserApiKey } from '../lib/userApiKeys';
import { rateLimit } from '../lib/rateLimit';
import { buildSystemPrompt, buildUserPrompt } from '../lib/ai/prompts';
import { AIResponseError, buildPreviewFromParsed, parseAIResponse } from '../lib/ai/preview';
import type { AIImportPreview, AIImportSection } from '../lib/ai/types';

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

// ─── Shared helpers ──────────────────────────────────────────────────

/** Validation error that must reach the client as 4xx, not as a 500. */
class ImportError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Output budget for one import. Configurable, but bounded to avoid runaway cost. */
const IMPORT_MAX_TOKENS = (() => {
  const raw = Number(process.env.AI_IMPORT_MAX_TOKENS);
  return Number.isFinite(raw) && raw >= 1024 && raw <= 8192 ? Math.trunc(raw) : 7168;
})();

const TRUNCATION_ERROR =
  'AI output was truncated at the token limit. Split the document or raise AI_IMPORT_MAX_TOKENS.';

function isTruncated(reason: string | undefined): boolean {
  return Boolean(reason && ['length', 'max_tokens'].includes(reason.toLowerCase()));
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

    const ai = createProvider(provider, resolvedApiKey, baseUrl);
    const systemPrompt = buildSystemPrompt(context, {
      startDate: typeof startDate === 'string' ? startDate : undefined,
    });
    const userPrompt = buildUserPrompt(markdown.trim(), typeof projectName === 'string' ? projectName : undefined);
    const controller = attachClientAbort(res);
    const importModel = resolveImportModel(provider, model);

    const response = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model: importModel,
        temperature: 0.2,
        maxTokens: IMPORT_MAX_TOKENS,
        responseFormat: 'json_object',
        effort: 'low',
        signal: controller.signal,
      }
    );

    if (isTruncated(response.finishReason)) {
      res.status(502).json({ error: TRUNCATION_ERROR });
      return;
    }

    const parsed = parseAIResponse(response.content);
    const { preview, projectName: generatedProjectName } = buildPreviewFromParsed(
      parsed,
      context?.sections ?? []
    );

    if (preview.length === 0) {
      res.status(400).json({ error: 'No valid sections could be extracted from the AI response' });
      return;
    }

    await resolveAssignees(preview, req.userId!);

    const result: AIImportPreview = {
      sections: preview,
      projectName: generatedProjectName,
      ...(response.usage ? { usage: response.usage } : {}),
    };
    res.json(result);
  } catch (error: any) {
    if (res.destroyed || res.writableEnded) return;
    console.error('AI preview error:', error);
    const msg = error?.message || 'Internal server error';
    if (error instanceof AIResponseError) {
      res.status(error.status).json({ error: msg });
    } else if (msg.includes('not configured') || msg.includes('API key')) {
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

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const controller = attachClientAbort(res);

    try {
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

      const ai = createProvider(provider, resolvedApiKey, baseUrl);
      const systemPrompt = buildSystemPrompt(context, {
        startDate: typeof startDate === 'string' ? startDate : undefined,
      });
      const userPrompt = buildUserPrompt(markdown.trim(), typeof projectName === 'string' ? projectName : undefined);
      const importModel = resolveImportModel(provider, model);
      let usage: { promptTokens: number; completionTokens: number } | undefined;
      let finishReason: string | undefined;

      let fullContent = '';

      for await (const token of ai.chatStream(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          model: importModel,
          temperature: 0.2,
          maxTokens: IMPORT_MAX_TOKENS,
          responseFormat: 'json_object',
          effort: 'low',
          signal: controller.signal,
          onUsage: (reported) => { usage = reported; },
          onFinish: (reason) => { finishReason = reason; },
        }
      )) {
        fullContent += token;
        sendEvent({ token });
      }

      if (isTruncated(finishReason)) {
        sendEvent({ error: TRUNCATION_ERROR });
        res.end();
        return;
      }

      // Parse and build preview
      const parsed = parseAIResponse(fullContent);
      const { preview, projectName: generatedProjectName } = buildPreviewFromParsed(
        parsed,
        context?.sections ?? []
      );

      if (preview.length === 0) {
        sendEvent({ error: 'No valid sections could be extracted from the AI response' });
        res.end();
        return;
      }

      await resolveAssignees(preview, req.userId!);

      const result: AIImportPreview = {
        sections: preview,
        projectName: generatedProjectName,
        ...(usage ? { usage } : {}),
      };
      sendEvent({ done: true, preview: result, ...(usage ? { usage } : {}) });
      res.end();
    } catch (innerError: any) {
      if (controller.signal.aborted) {
        res.end();
        return;
      }
      console.error('AI preview stream error:', innerError);
      sendEvent({ error: innerError?.message || 'Stream generation failed' });
      res.end();
    }
  } catch (error: any) {
    console.error('AI preview stream setup error:', error);
    // If headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
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
