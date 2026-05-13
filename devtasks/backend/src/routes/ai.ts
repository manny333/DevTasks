import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createProvider, getAvailableProviders } from '../lib/ai/factory';
import { buildSystemPrompt, buildUserPrompt } from '../lib/ai/prompts';
import type { AIProvider, AIImportPreview, AIImportSection } from '../lib/ai/types';

const router = Router();
router.use(authMiddleware);

// GET /api/ai/providers — list available AI providers (env + user keys)
router.get('/providers', async (req: AuthRequest, res: Response) => {
  const userKeys = await prisma.userApiKey.findMany({
    where: { userId: req.userId!, isActive: true },
    select: { provider: true, label: true },
  });
  res.json(getAvailableProviders(userKeys));
});

// ─── Shared helpers ──────────────────────────────────────────────────

const PREVIEW_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#84cc16'];

async function parseAIResponse(rawContent: string, ai: AIProvider, model?: string): Promise<any> {
  // Strategy 1: extract from markdown code block
  let content = rawContent;
  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) content = codeBlock[1].trim();

  // Strategy 2: extract outermost { } or [ ]
  const jsonExtract = content.match(/([\{\[][\s\S]*[\}\]])/);
  if (jsonExtract) content = jsonExtract[1].trim();

  // Strategy 3: fix common LLM JSON mistakes
  const fixed = content
    .replace(/,\s*}/g, '}')
    .replace(/,\s*\]/g, ']')
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ':"$1"');

  try {
    return JSON.parse(fixed);
  } catch {
    // Last resort: ask LLM to fix it (retry once)
    const fixResponse = await ai.chat(
      [
        { role: 'system', content: 'You are a JSON fixer. The following text should be valid JSON but has a syntax error. Return ONLY the corrected JSON, no other text.' },
        { role: 'user', content: `Fix this JSON:\n${content.slice(0, 2000)}` },
      ],
      { model, temperature: 0, maxTokens: 4096 }
    );
    const fixedContent = fixResponse.content.replace(/```[^`]*```/g, '').trim();
    const fixedMatch = fixedContent.match(/(\{[\s\S]*\})/);
    return JSON.parse(fixedMatch ? fixedMatch[1] : fixedContent);
  }
}

function buildPreviewFromParsed(parsed: any): { preview: AIImportSection[]; projectName?: string } {
  const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const projectName = typeof parsed.projectName === 'string' ? parsed.projectName : undefined;

  const preview: AIImportSection[] = [];
  let secIdx = 0;
  let taskIdx = 0;

  for (const raw of rawSections) {
    if (!raw.name || typeof raw.name !== 'string') continue;
    secIdx++;
    const section: AIImportSection = {
      tempId: `sec-${secIdx}`,
      name: raw.name,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      action: 'create',
      color: PREVIEW_COLORS[secIdx % PREVIEW_COLORS.length],
      tasks: [],
      selected: true,
    };

    const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    for (const rt of rawTasks) {
      if (!rt.title || typeof rt.title !== 'string') continue;
      taskIdx++;
      const tags = (Array.isArray(rt.tags) ? rt.tags : []).map((t: string) => ({
        name: String(t),
        action: 'create' as const,
      }));
      const emails = (Array.isArray(rt.assigneeEmails) ? rt.assigneeEmails : []).map((e: string) => ({ email: String(e) }));
      const subtasks = (Array.isArray(rt.subtasks) ? rt.subtasks : []).map((s: any) => ({
        title: typeof s.title === 'string' ? s.title : String(s),
      }));
      section.tasks.push({
        tempId: `task-${taskIdx}`,
        title: rt.title,
        description: typeof rt.description === 'string' ? rt.description : undefined,
        section: section.name,
        tags,
        assignees: emails,
        subtasks,
        dueDate: typeof rt.dueDate === 'string' ? rt.dueDate : undefined,
        startDate: typeof rt.startDate === 'string' ? rt.startDate : undefined,
        selected: true,
      });
    }

    preview.push(section);
  }

  return { preview, projectName };
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

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      res.status(400).json({ error: 'markdown is required' });
      return;
    }

    const provider = providerId || 'deepseek';

    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const userKey = await prisma.userApiKey.findUnique({
        where: { userId_provider: { userId: req.userId!, provider } },
      });
      if (userKey) resolvedApiKey = userKey.apiKey;
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

    const response = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model, temperature: 0.3, maxTokens: 8192 }
    );

    const parsed = await parseAIResponse(response.content, ai, model);
    const { preview, projectName: generatedProjectName } = buildPreviewFromParsed(parsed);

    if (preview.length === 0) {
      res.status(400).json({ error: 'No valid sections could be extracted from the AI response' });
      return;
    }

    await resolveAssignees(preview, req.userId!);

    const result: AIImportPreview = { sections: preview, projectName: generatedProjectName };
    res.json(result);
  } catch (error: any) {
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

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      res.status(400).json({ error: 'markdown is required' });
      return;
    }

    const provider = providerId || 'deepseek';

    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const userKey = await prisma.userApiKey.findUnique({
        where: { userId_provider: { userId: req.userId!, provider } },
      });
      if (userKey) resolvedApiKey = userKey.apiKey;
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

      let fullContent = '';

      for await (const token of ai.chatStream(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { model, temperature: 0.3, maxTokens: 8192 }
      )) {
        fullContent += token;
        sendEvent({ token });
      }

      // Parse and build preview
      const parsed = await parseAIResponse(fullContent, ai, model);
      const { preview, projectName: generatedProjectName } = buildPreviewFromParsed(parsed);

      if (preview.length === 0) {
        sendEvent({ error: 'No valid sections could be extracted from the AI response' });
        res.end();
        return;
      }

      await resolveAssignees(preview, req.userId!);

      const result: AIImportPreview = { sections: preview, projectName: generatedProjectName };
      sendEvent({ done: true, preview: result });
      res.end();
    } catch (innerError: any) {
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

    const sections = preview.sections as AIImportSection[];
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    const actorName = actor?.name ?? 'AI Import';

    let createdSections = 0;
    let createdTasks = 0;
    let createdTags = 0;
    let createdAssignees = 0;

    const SECTION_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#84cc16'];
    const TAG_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16', '#e11d48', '#7c3aed'];

    for (const sec of sections) {
      if (!sec.selected) continue;

      let sectionId: string;

      if (sec.action === 'reuse' && sec.existingSectionId) {
        sectionId = sec.existingSectionId;
      } else {
        const lastSection = await prisma.section.findFirst({
          where: { projectId: projectId as string },
          orderBy: { position: 'desc' },
        });
        const newSection = await prisma.section.create({
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

      for (const task of sec.tasks) {
        if (!task.selected) continue;

        const lastTask = await prisma.task.findFirst({
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

        const created = await prisma.task.create({
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

        if (task.subtasks.length > 0) {
          for (let i = 0; i < task.subtasks.length; i++) {
            await prisma.subtask.create({
              data: {
                title: task.subtasks[i].title,
                position: i,
                taskId: created.id,
              },
            });
          }
        }

        for (const tag of task.tags) {
          let tagRecord = await prisma.tag.findFirst({
            where: { projectId: projectId as string, name: tag.name },
          });
          if (!tagRecord) {
            tagRecord = await prisma.tag.create({
              data: {
                name: tag.name,
                color: TAG_COLORS[createdTags % TAG_COLORS.length],
                projectId: projectId as string,
              },
            });
            createdTags++;
          }
          await prisma.taskTag.create({
            data: { taskId: created.id, tagId: tagRecord.id },
          });
        }

        for (const a of task.assignees) {
          if (!a.found || !a.userId) continue;
          const existing = await prisma.taskAssignee.findUnique({
            where: { taskId_userId: { taskId: created.id, userId: a.userId } },
          });
          if (!existing) {
            await prisma.taskAssignee.create({
              data: { taskId: created.id, userId: a.userId, accessType: 'VIEWER' },
            });
            createdAssignees++;
          }
        }
      }
    }

    res.json({
      success: true,
      created: { sections: createdSections, tasks: createdTasks, tags: createdTags, assignees: createdAssignees },
    });
  } catch (error: any) {
    console.error('AI apply error:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

export default router;
