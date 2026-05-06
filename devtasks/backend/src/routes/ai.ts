import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createProvider, getAvailableProviders } from '../lib/ai/factory';
import { buildSystemPrompt, buildUserPrompt } from '../lib/ai/prompts';
import type { AIImportPreview, AIImportSection, AIImportTask } from '../lib/ai/types';

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

// POST /api/ai/preview — generate import preview from markdown
router.post('/preview', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { markdown, projectId, provider: providerId, model, apiKey, baseUrl } = req.body;

    if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
      res.status(400).json({ error: 'markdown is required' });
      return;
    }

    const provider = providerId || 'deepseek';

    // Resolve API key: user-provided > user saved key > env var
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
    const systemPrompt = buildSystemPrompt(context);
    const userPrompt = buildUserPrompt(markdown.trim());

    const response = await ai.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { model, temperature: 0.3, maxTokens: 8192 }
    );

    let parsed: any;
    let rawContent = response.content;

    // Strategy 1: extract from markdown code block
    const codeBlock = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) rawContent = codeBlock[1].trim();

    // Strategy 2: extract outermost { } or [ ]
    const jsonExtract = rawContent.match(/([\{\[][\s\S]*[\}\]])/);
    if (jsonExtract) rawContent = jsonExtract[1].trim();

    // Strategy 3: fix common LLM JSON mistakes
    const fixed = rawContent
      .replace(/,\s*}/g, '}')          // trailing comma in objects
      .replace(/,\s*\]/g, ']')         // trailing comma in arrays
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // unquoted keys
      .replace(/:\s*'([^']*)'/g, ':"$1"'); // single-quoted values

    try {
      parsed = JSON.parse(fixed);
    } catch (e1) {
      // Last resort: ask LLM to fix it (retry once)
      try {
        const fixResponse = await ai.chat(
          [
            { role: 'system', content: 'You are a JSON fixer. The following text should be valid JSON but has a syntax error. Return ONLY the corrected JSON, no other text.' },
            { role: 'user', content: `Fix this JSON:\n${rawContent.slice(0, 2000)}` },
          ],
          { model, temperature: 0, maxTokens: 4096 }
        );
        const fixedContent = fixResponse.content.replace(/```[^`]*```/g, '').trim();
        const fixedMatch = fixedContent.match(/(\{[\s\S]*\})/);
        parsed = JSON.parse(fixedMatch ? fixedMatch[1] : fixedContent);
      } catch {
        res.status(500).json({ error: 'AI response was not valid JSON and could not be repaired', raw: rawContent.slice(0, 500) });
        return;
      }
    }

    const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const PREVIEW_COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#84cc16'];

    // Normalize and build preview with tempIds
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
          selected: true,
        });
      }

      preview.push(section);
    }

    if (preview.length === 0) {
      res.status(400).json({ error: 'No valid sections could be extracted from the AI response' });
      return;
    }

    // Resolve assignees against DB
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

    const result: AIImportPreview = { sections: preview };
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

// POST /api/ai/apply — create sections, tasks, tags from confirmed preview
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

        const created = await prisma.task.create({
          data: {
            title: task.title,
            description: task.description || null,
            dueDate: normalizedDue,
            status: 'TODO',
            position: (lastTask?.position ?? -1) + 1,
            sectionId,
          },
        });
        createdTasks++;

        // Create subtasks
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

        // Add tags
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

        // Assign members
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
