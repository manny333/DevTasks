import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const STATUSES = new Set(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);

// GET /api/me/tasks — tasks assigned to the current user
router.get('/tasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' && STATUSES.has(req.query.status)
      ? req.query.status
      : undefined;
    const rawLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;

    const tasks = await prisma.task.findMany({
      where: {
        archived: false,
        assignees: { some: { userId: req.userId! } },
        ...(status ? { status: status as 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' } : {}),
      },
      include: {
        section: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        },
        tags: { include: { tag: true } },
        subtasks: { orderBy: { position: 'asc' } },
        _count: { select: { comments: true, subtasks: true } },
      },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      take: limit,
    });

    res.json(tasks);
  } catch (error) {
    console.error('My tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
