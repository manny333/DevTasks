import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getProjectScope } from '../lib/access';

const router = Router();
router.use(authMiddleware);

// GET /api/projects/:projectId/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/:projectId/calendar', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getProjectScope(req.userId!, req.params.projectId as string);
    if (!scope) {
      res.status(403).json({ error: 'No access to this project' });
      return;
    }

    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params are required (YYYY-MM-DD)' });
      return;
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      res.status(400).json({ error: 'Invalid date format' });
      return;
    }

    const where: Record<string, unknown> = {
      section: { projectId: req.params.projectId as string },
      dueDate: { gte: fromDate, lte: toDate },
      archived: false,
    };
    if (!scope.all) {
      where.OR = [
        { sectionId: { in: scope.sectionIds } },
        { id: { in: scope.taskIds } },
      ];
    }

    const tasks = await prisma.task.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        subtasks: { orderBy: { position: 'asc' } },
        section: { select: { id: true, name: true, color: true } },
        _count: { select: { comments: true, subtasks: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    res.json(tasks);
  } catch (error) {
    console.error('Calendar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
