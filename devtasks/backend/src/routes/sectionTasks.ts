import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getSectionAccess, canEdit } from '../lib/access';

const router = Router();
router.use(authMiddleware);

// POST /api/sections/:sectionId/tasks
router.post('/:sectionId/tasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await getSectionAccess(req.userId!, req.params.sectionId as string);
    if (!access) { res.status(403).json({ error: 'No access to this section' }); return; }
    if (!canEdit(access)) { res.status(403).json({ error: 'You have read-only access' }); return; }

    const { title, description, status, priority, dueDate } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    if (priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) {
      res.status(400).json({ error: 'Invalid priority' });
      return;
    }

    const dueDateValue = dueDate === undefined || dueDate === null || dueDate === ''
      ? null
      : new Date(dueDate);

    if (dueDateValue instanceof Date && Number.isNaN(dueDateValue.getTime())) {
      res.status(400).json({ error: 'Invalid dueDate' });
      return;
    }

    const targetStatus = status || 'TODO';

    const last = await prisma.task.findFirst({
      where: { sectionId: req.params.sectionId as string, status: targetStatus },
      orderBy: { position: 'desc' },
    });

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description || null,
        status: targetStatus,
        priority: priority || 'MEDIUM',
        dueDate: dueDateValue,
        position: (last?.position ?? -1) + 1,
        sectionId: req.params.sectionId as string,
      },
      include: { tags: { include: { tag: true } }, _count: { select: { comments: true } } },
    });
    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sections/:sectionId/tasks
router.get('/:sectionId/tasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const showArchived = req.query.archived === 'true';
    const tasks = await prisma.task.findMany({
      where: {
        sectionId: req.params.sectionId as string,
        ...(!showArchived && { archived: false }),
      },
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        _count: { select: { comments: true } },
      },
      orderBy: { position: 'asc' },
    });
    res.json(tasks);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
