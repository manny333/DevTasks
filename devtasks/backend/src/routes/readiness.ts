import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { canManageAccess, getProjectAccess, requireProjectAccess } from '../lib/access';
import { computeReadiness, DEFAULT_READY_CONFIG } from '../lib/readiness';

const router = Router();
router.use(authMiddleware);

const CONFIG_SELECT = {
  projectId: true,
  requireContext: true,
  requireAcceptanceCriteria: true,
  requireNoBlockers: true,
  requireDocument: true,
  updatedById: true,
  updatedBy: { select: { id: true, name: true, email: true } },
  updatedAt: true,
} as const;

const READINESS_TASK_INCLUDE = {
  section: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
  subtasks: { orderBy: { position: 'asc' as const } },
  blockedBy: {
    include: { dependsOn: { select: { id: true, title: true, status: true } } },
  },
  documents: {
    include: {
      document: { select: { id: true, title: true, slug: true, category: true, isPinned: true } },
    },
  },
  _count: { select: { comments: true, subtasks: true } },
} as const;

async function configFor(projectId: string) {
  const config = await prisma.projectReadyConfig.findUnique({
    where: { projectId },
    select: CONFIG_SELECT,
  });
  if (!config) {
    return {
      projectId,
      ...DEFAULT_READY_CONFIG,
      updatedById: null,
      updatedBy: null,
      updatedAt: null,
    };
  }
  return config;
}

// GET /api/projects/:projectId/readiness-config
router.get('/:projectId/readiness-config', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    res.json(await configFor(req.params.projectId as string));
  } catch (error) {
    console.error('Get readiness config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:projectId/readiness-config
router.patch('/:projectId/readiness-config', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await getProjectAccess(req.userId!, req.params.projectId as string);
    if (!access) {
      res.status(403).json({ error: 'No access to this project' });
      return;
    }
    if (!canManageAccess(access)) {
      res.status(403).json({ error: 'Only FULL or OWNER project members can change Definition of Ready' });
      return;
    }
    const projectId = req.params.projectId as string;
    const data: Record<string, boolean> = {};
    for (const key of ['requireContext', 'requireAcceptanceCriteria', 'requireNoBlockers', 'requireDocument']) {
      if (req.body?.[key] === undefined) continue;
      if (typeof req.body[key] !== 'boolean') {
        res.status(400).json({ error: `${key} must be a boolean` });
        return;
      }
      data[key] = req.body[key];
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Provide at least one readiness setting' });
      return;
    }
    const config = await prisma.projectReadyConfig.upsert({
      where: { projectId },
      update: { ...data, updatedById: req.userId! },
      create: { projectId, ...data, updatedById: req.userId! },
      select: CONFIG_SELECT,
    });
    res.json(config);
  } catch (error) {
    console.error('Update readiness config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/pickable
router.get('/:projectId/pickable', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    const projectId = req.params.projectId as string;
    const config = await configFor(projectId);
    const state = typeof req.query.state === 'string' ? req.query.state.toUpperCase() : 'READY';
    if (!['READY', 'NEEDS_CONTEXT', 'BLOCKED', 'ALL'].includes(state)) {
      res.status(400).json({ error: 'state must be READY, NEEDS_CONTEXT, BLOCKED or ALL' });
      return;
    }
    const includeAssigned = req.query.includeAssigned === 'true';
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);

    const tasks = await prisma.task.findMany({
      where: {
        section: { projectId },
        status: 'TODO',
        archived: false,
        ...(includeAssigned ? {} : { assignees: { none: {} } }),
      },
      include: READINESS_TASK_INCLUDE,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });

    const evaluated = tasks.map((task) => ({
      ...task,
      readiness: computeReadiness(task, config),
    }));
    const counts = {
      ready: evaluated.filter((task) => task.readiness.state === 'READY').length,
      needsContext: evaluated.filter((task) => task.readiness.state === 'NEEDS_CONTEXT').length,
      blocked: evaluated.filter((task) => task.readiness.state === 'BLOCKED').length,
      pickable: evaluated.filter((task) => task.readiness.pickable).length,
    };
    const filtered = (state === 'ALL'
      ? evaluated
      : evaluated.filter((task) => task.readiness.state === state)
    ).slice(0, limit);

    res.json({ tasks: filtered, counts, config });
  } catch (error) {
    console.error('List pickable tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
