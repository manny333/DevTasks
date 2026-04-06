import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireTaskAccess, getSectionAccess, canEdit } from '../lib/access';

const router = Router();
router.use(authMiddleware);

// PATCH /api/tasks/:id — update task
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { title, description } = req.body;
    const updated = await prisma.task.update({
      where: { id: req.params.id as string },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description }),
      },
      include: { tags: { include: { tag: true } }, assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } }, _count: { select: { comments: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/move — move task (change status/position for DnD)
router.patch('/:id/move', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { status, position } = req.body;
    if (!status || position === undefined) {
      res.status(400).json({ error: 'status and position are required' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.id as string } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Shift positions of other tasks in the target column
    await prisma.task.updateMany({
      where: {
        sectionId: task.sectionId,
        status,
        position: { gte: position },
        id: { not: task.id },
      },
      data: { position: { increment: 1 } },
    });

    const updated = await prisma.task.update({
      where: { id: req.params.id as string },
      data: { status, position },
      include: { tags: { include: { tag: true } }, _count: { select: { comments: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Move task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/move-section — move task to another section
router.patch('/:id/move-section', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { sectionId } = req.body;
    if (!sectionId) {
      res.status(400).json({ error: 'sectionId is required' });
      return;
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.id as string } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Place at end of same-status column in the target section
    const count = await prisma.task.count({ where: { sectionId, status: task.status } });

    const updated = await prisma.task.update({
      where: { id: req.params.id as string },
      data: { sectionId, position: count },
      include: { tags: { include: { tag: true } }, _count: { select: { comments: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Move section error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/archive — toggle archived
router.patch('/:id/archive', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const task = await prisma.task.findUnique({ where: { id: req.params.id as string } });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const updated = await prisma.task.update({
      where: { id: req.params.id as string },
      data: { archived: !task.archived },
    });
    res.json(updated);
  } catch (error) {
    console.error('Archive task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id — delete task
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    await prisma.task.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Task Tags ──────────────────────────────────────────

// POST /api/tasks/:id/tags — add tag to task
router.post('/:id/tags', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { tagId } = req.body;
    if (!tagId) {
      res.status(400).json({ error: 'tagId is required' });
      return;
    }
    await prisma.taskTag.create({ data: { taskId: req.params.id as string, tagId } });
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Add tag error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id/tags/:tagId — remove tag from task
router.delete('/:id/tags/:tagId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    await prisma.taskTag.delete({
      where: { taskId_tagId: { taskId: req.params.id as string, tagId: req.params.tagId as string } },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove tag error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Task Assignees ────────────────────────────────────────────

// POST /api/tasks/:id/assignees — assign user to task by email
router.post('/:id/assignees', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, accessType = 'VIEWER' } = req.body;
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }
    if (!['FULL', 'EDITOR', 'VIEWER'].includes(accessType)) {
      res.status(400).json({ error: 'Invalid accessType' }); return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const existing = await prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId: req.params.id as string, userId: user.id } },
    });
    if (existing) { res.status(409).json({ error: 'User already assigned to this task' }); return; }

    const assignee = await prisma.taskAssignee.create({
      data: { taskId: req.params.id as string, userId: user.id, accessType },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.status(201).json(assignee);
  } catch (error) {
    console.error('Add assignee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id/assignees — list task assignees
router.get('/:id/assignees', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const assignees = await prisma.taskAssignee.findMany({
      where: { taskId: req.params.id as string },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(assignees);
  } catch (error) {
    console.error('List assignees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/assignees/:userId — update assignee accessType
router.patch('/:id/assignees/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessType } = req.body;
    if (!['FULL', 'EDITOR', 'VIEWER'].includes(accessType)) {
      res.status(400).json({ error: 'Invalid accessType' }); return;
    }
    const updated = await prisma.taskAssignee.update({
      where: { taskId_userId: { taskId: req.params.id as string, userId: req.params.userId as string } },
      data: { accessType },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update assignee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id/assignees/:userId — remove task assignee
router.delete('/:id/assignees/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId: req.params.id as string, userId: req.params.userId as string } },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove assignee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

