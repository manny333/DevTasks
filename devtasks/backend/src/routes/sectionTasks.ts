import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getSectionAccess, canEdit } from '../lib/access';
import { logActivity } from '../lib/activity';

const router = Router();
router.use(authMiddleware);

// POST /api/sections/:sectionId/tasks
router.post('/:sectionId/tasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await getSectionAccess(req.userId!, req.params.sectionId as string);
    if (!access) { res.status(403).json({ error: 'No access to this section' }); return; }
    if (!canEdit(access)) { res.status(403).json({ error: 'You have read-only access' }); return; }

    const { title, description, status, dueDate, startDate } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const targetStatus = status || 'TODO';
    let normalizedDueDate: Date | null = null;
    if (dueDate !== undefined && dueDate !== null && `${dueDate}`.trim() !== '') {
      const parsed = new Date(dueDate);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Invalid dueDate' });
        return;
      }
      normalizedDueDate = parsed;
    }
    let normalizedStartDate: Date | null = null;
    if (startDate !== undefined && startDate !== null && `${startDate}`.trim() !== '') {
      const parsed = new Date(startDate);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Invalid startDate' });
        return;
      }
      normalizedStartDate = parsed;
    }

    const last = await prisma.task.findFirst({
      where: { sectionId: req.params.sectionId as string, status: targetStatus },
      orderBy: { position: 'desc' },
    });

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description || null,
        startDate: normalizedStartDate,
        dueDate: normalizedDueDate,
        status: targetStatus,
        position: (last?.position ?? -1) + 1,
        sectionId: req.params.sectionId as string,
      },
      include: {
        tags: { include: { tag: true } },
        subtasks: { orderBy: { position: 'asc' } },
        _count: { select: { comments: true, subtasks: true } },
      },
    });

    const section = await prisma.section.findUnique({
      where: { id: req.params.sectionId as string },
      include: { project: { select: { id: true } } },
    });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (section) {
      logActivity({
        action: 'TASK_CREATED',
        taskId: task.id,
        taskTitle: task.title,
        projectId: section.project.id,
        sectionId: section.id,
        sectionName: section.name,
        actorId: req.userId!,
        actorName: actor?.name ?? 'Someone',
      });
    }

    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sections/:sectionId/tasks
// Query params: archived, status (repeatable), assigneeId, tagId, dueDateFrom, dueDateTo
router.get('/:sectionId/tasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const showArchived = req.query.archived === 'true';
    const rawStatus = req.query.status;
    const statusList: string[] = typeof rawStatus === 'string' ? [rawStatus] : Array.isArray(rawStatus) ? (rawStatus as string[]) : [];
    const validStatuses = statusList.filter((s) => ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].includes(s));
    const assigneeId = typeof req.query.assigneeId === 'string' ? req.query.assigneeId : undefined;
    const tagId = typeof req.query.tagId === 'string' ? req.query.tagId : undefined;
    const dueDateFrom = typeof req.query.dueDateFrom === 'string' ? req.query.dueDateFrom : undefined;
    const dueDateTo = typeof req.query.dueDateTo === 'string' ? req.query.dueDateTo : undefined;

    const where: Record<string, unknown> = {
      sectionId: req.params.sectionId as string,
    };
    if (!showArchived) where.archived = false;
    if (validStatuses && validStatuses.length > 0) where.status = { in: validStatuses };
    if (assigneeId) where.assignees = { some: { userId: assigneeId } };
    if (tagId) where.tags = { some: { tagId } };
    if (dueDateFrom || dueDateTo) {
      const dueFilter: Record<string, Date> = {};
      if (dueDateFrom) {
        const d = new Date(dueDateFrom);
        if (!Number.isNaN(d.getTime())) dueFilter.gte = d;
      }
      if (dueDateTo) {
        const d = new Date(dueDateTo);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          dueFilter.lte = d;
        }
      }
      if (Object.keys(dueFilter).length > 0) where.dueDate = dueFilter;
    }

    const tasks = await prisma.task.findMany({
      where: where as any,
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        subtasks: { orderBy: { position: 'asc' } },
        _count: { select: { comments: true, subtasks: true } },
      },
      orderBy: { position: 'asc' },
    });
    res.json(tasks);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/sections/:sectionId/tasks/archive-by-status
router.patch('/:sectionId/tasks/archive-by-status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await getSectionAccess(req.userId!, req.params.sectionId as string);
    if (!access) { res.status(403).json({ error: 'No access to this section' }); return; }
    if (!canEdit(access)) { res.status(403).json({ error: 'You have read-only access' }); return; }

    const { status } = req.body;
    if (!status || !['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'].includes(status)) {
      res.status(400).json({ error: 'Valid status is required' });
      return;
    }

    const result = await prisma.task.updateMany({
      where: {
        sectionId: req.params.sectionId as string,
        status,
        archived: false,
      },
      data: { archived: true },
    });

    res.json({ success: true, archivedCount: result.count });
  } catch (error) {
    console.error('Archive tasks by status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
