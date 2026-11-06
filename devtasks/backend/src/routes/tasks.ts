import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireTaskAccess, ensureSectionAccess } from '../lib/access';
import { notify } from '../lib/notify';
import { logActivity, logTaskEvent } from '../lib/activity';

const router = Router();
router.use(authMiddleware);

const STATUS_ORDER: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  IN_REVIEW: 2,
  DONE: 3,
};

// GET /api/tasks/:id — full task detail
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;

    const task = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      include: {
        section: {
          select: {
            id: true,
            name: true,
            color: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        },
        tags: { include: { tag: true } },
        assignees: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        },
        subtasks: { orderBy: { position: 'asc' } },
        comments: {
          orderBy: { createdAt: 'asc' },
          take: 100,
          include: { author: { select: { id: true, name: true, avatar: true } } },
        },
        blockedBy: {
          include: { dependsOn: { select: { id: true, title: true, status: true } } },
        },
        blocks: {
          include: { task: { select: { id: true, title: true, status: true } } },
        },
        attachments: {
          select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
        },
        _count: { select: { comments: true, subtasks: true, attachments: true } },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    res.json(task);
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id — update task
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { title, description, dueDate, startDate } = req.body;
    let normalizedDueDate: Date | null | undefined = undefined;
    if (dueDate !== undefined) {
      if (dueDate === null || `${dueDate}`.trim() === '') {
        normalizedDueDate = null;
      } else {
        const parsed = new Date(dueDate);
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({ error: 'Invalid dueDate' });
          return;
        }
        normalizedDueDate = parsed;
      }
    }
    let normalizedStartDate: Date | null | undefined = undefined;
    if (startDate !== undefined) {
      if (startDate === null || `${startDate}`.trim() === '') {
        normalizedStartDate = null;
      } else {
        const parsed = new Date(startDate);
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({ error: 'Invalid startDate' });
          return;
        }
        normalizedStartDate = parsed;
      }
    }

    const updated = await prisma.task.update({
      where: { id: req.params.id as string },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description }),
        ...(normalizedStartDate !== undefined && { startDate: normalizedStartDate }),
        ...(normalizedDueDate !== undefined && { dueDate: normalizedDueDate }),
      },
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        subtasks: { orderBy: { position: 'asc' } },
        blockedBy: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
        blocks: { include: { task: { select: { id: true, title: true, status: true } } } },
        _count: { select: { comments: true, subtasks: true } },
      },
    });
    void logTaskEvent({
      taskId: req.params.id as string,
      actorId: req.userId!,
      action: 'TASK_UPDATED',
      details: { fields: Object.keys(req.body ?? {}) },
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

    const task = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      include: {
        assignees: { select: { userId: true } },
        section: { include: { project: { select: { id: true, name: true } } } },
        blockedBy: { include: { dependsOn: { select: { status: true } } } },
      },
    });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Block status advance if task has unresolved dependencies
    if (status !== task.status) {
      const currentOrder = STATUS_ORDER[task.status] ?? 0;
      const newOrder = STATUS_ORDER[status] ?? 0;
      if (newOrder > currentOrder) {
        const unresolved = task.blockedBy.some((d) => d.dependsOn.status !== 'DONE');
        if (unresolved) {
          res.status(409).json({
            error: 'Task is blocked by unresolved dependencies',
            code: 'TASK_BLOCKED',
          });
          return;
        }
      }
    }

    // Shift positions and apply the move atomically so concurrent drags cannot
    // leave duplicate or gapped positions behind.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: {
          sectionId: task.sectionId,
          status,
          position: { gte: position },
          id: { not: task.id },
        },
        data: { position: { increment: 1 } },
      });

      return tx.task.update({
        where: { id: req.params.id as string },
        data: { status, position },
        include: {
          tags: { include: { tag: true } },
          subtasks: { orderBy: { position: 'asc' } },
          blockedBy: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
          blocks: { include: { task: { select: { id: true, title: true, status: true } } } },
          _count: { select: { comments: true, subtasks: true } },
        },
      });
    });

    // Notify assignees about status change (skip if status didn't change)
    if (task.status !== status) {
      const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
      const recipientIds = task.assignees.map((a) => a.userId).filter((id) => id !== req.userId);
      notify({
        type: 'TASK_STATUS_CHANGED',
        userIds: recipientIds,
        actorName: actor?.name ?? 'Someone',
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.section.project.id,
        projectName: task.section.project.name,
        meta: { newStatus: status },
      });

      logActivity({
        action: 'TASK_STATUS_CHANGED',
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.section.project.id,
        sectionId: task.section.id,
        sectionName: task.section.name,
        actorId: req.userId!,
        actorName: actor?.name ?? 'Someone',
        details: { oldStatus: task.status, newStatus: status },
      });
    }

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

    const task = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      include: { section: { include: { project: { select: { id: true, name: true } } } } },
    });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const targetSection = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, name: true, projectId: true, project: { select: { id: true, name: true } } },
    });
    if (!targetSection) {
      res.status(404).json({ error: 'Target section not found' });
      return;
    }
    if (targetSection.projectId !== task.section.project.id) {
      res.status(400).json({ error: 'Tasks can only move between sections of the same project' });
      return;
    }
    if (!await ensureSectionAccess(req.userId!, sectionId, res, true)) return;

    // Place at the end of the same-status column, atomically.
    const updated = await prisma.$transaction(async (tx) => {
      const count = await tx.task.count({ where: { sectionId, status: task.status } });
      return tx.task.update({
        where: { id: req.params.id as string },
        data: { sectionId, position: count },
        include: {
          tags: { include: { tag: true } },
          subtasks: { orderBy: { position: 'asc' } },
          blockedBy: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
          blocks: { include: { task: { select: { id: true, title: true, status: true } } } },
          _count: { select: { comments: true, subtasks: true } },
        },
      });
    });

    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    logActivity({
      action: 'TASK_MOVED_SECTION',
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.section.project.id,
      sectionId: targetSection?.id ?? sectionId,
      sectionName: targetSection?.name ?? '',
      actorId: req.userId!,
      actorName: actor?.name ?? 'Someone',
      details: { fromSectionId: task.section.id, fromSectionName: task.section.name, toSectionId: sectionId, toSectionName: targetSection?.name },
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
    const task = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      include: { section: { include: { project: { select: { id: true, name: true } } } } },
    });
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const updated = await prisma.task.update({
      where: { id: req.params.id as string },
      data: { archived: !task.archived },
    });

    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    logActivity({
      action: !task.archived ? 'TASK_ARCHIVED' : 'TASK_UNARCHIVED',
      taskId: task.id,
      taskTitle: task.title,
      projectId: task.section.project.id,
      sectionId: task.section.id,
      sectionName: task.section.name,
      actorId: req.userId!,
      actorName: actor?.name ?? 'Someone',
    });

    res.json(updated);
  } catch (error) {
    console.error('Archive task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Subtasks ──────────────────────────────────────────

// GET /api/tasks/:id/subtasks — list task subtasks
router.get('/:id/subtasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res, false)) return;
    const subtasks = await prisma.subtask.findMany({
      where: { taskId: req.params.id as string },
      orderBy: { position: 'asc' },
    });
    res.json(subtasks);
  } catch (error) {
    console.error('List subtasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/subtasks — create subtask
router.post('/:id/subtasks', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { title } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const last = await prisma.subtask.findFirst({
      where: { taskId: req.params.id as string },
      orderBy: { position: 'desc' },
    });

    const subtask = await prisma.subtask.create({
      data: {
        title: title.trim(),
        position: (last?.position ?? -1) + 1,
        taskId: req.params.id as string,
      },
    });
    void logTaskEvent({
      taskId: req.params.id as string,
      actorId: req.userId!,
      action: 'SUBTASK_ADDED',
      details: { title: subtask.title },
    });
    res.status(201).json(subtask);
  } catch (error) {
    console.error('Create subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/subtasks/:subtaskId — update subtask
router.patch('/:id/subtasks/:subtaskId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { title, completed, position } = req.body;

    const existing = await prisma.subtask.findUnique({
      where: { id: req.params.subtaskId as string },
    });
    if (!existing || existing.taskId !== req.params.id) {
      res.status(404).json({ error: 'Subtask not found' });
      return;
    }

    const updated = await prisma.subtask.update({
      where: { id: req.params.subtaskId as string },
      data: {
        ...(title !== undefined && typeof title === 'string' && title.trim().length > 0 && { title: title.trim() }),
        ...(typeof completed === 'boolean' && { completed }),
        ...(typeof position === 'number' && { position }),
      },
    });
    if (typeof completed === 'boolean') {
      void logTaskEvent({
        taskId: req.params.id as string,
        actorId: req.userId!,
        action: completed ? 'SUBTASK_COMPLETED' : 'SUBTASK_UNCOMPLETED',
        details: { title: updated.title },
      });
    }
    res.json(updated);
  } catch (error) {
    console.error('Update subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id/subtasks/:subtaskId — delete subtask
router.delete('/:id/subtasks/:subtaskId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;

    const existing = await prisma.subtask.findUnique({
      where: { id: req.params.subtaskId as string },
    });
    if (!existing || existing.taskId !== req.params.id) {
      res.status(404).json({ error: 'Subtask not found' });
      return;
    }

    await prisma.subtask.delete({
      where: { id: req.params.subtaskId as string },
    });
    void logTaskEvent({
      taskId: req.params.id as string,
      actorId: req.userId!,
      action: 'SUBTASK_DELETED',
      details: { title: existing.title },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id — delete task
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    // Record the deletion before removing the row: the ActivityLog FK is
    // ON DELETE SET NULL, so the audit entry survives with its denormalized title.
    await logTaskEvent({
      taskId: req.params.id as string,
      actorId: req.userId!,
      action: 'TASK_DELETED',
    });
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

    const [taskProject, tagRecord] = await Promise.all([
      prisma.task.findUnique({
        where: { id: req.params.id as string },
        select: { section: { select: { projectId: true } } },
      }),
      prisma.tag.findUnique({ where: { id: tagId }, select: { projectId: true } }),
    ]);
    if (!tagRecord) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    if (!taskProject || tagRecord.projectId !== taskProject.section.projectId) {
      res.status(400).json({ error: 'Tag belongs to a different project' });
      return;
    }

    try {
      await prisma.taskTag.create({ data: { taskId: req.params.id as string, tagId } });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        res.status(409).json({ error: 'Tag is already applied to this task' });
        return;
      }
      throw error;
    }

    const taskMeta = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      select: { title: true, section: { select: { id: true, name: true, project: { select: { id: true } } } } },
    });
    const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { name: true } });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (taskMeta) {
      logActivity({
        action: 'TAG_ADDED',
        taskId: req.params.id as string,
        taskTitle: taskMeta.title,
        projectId: taskMeta.section.project.id,
        sectionId: taskMeta.section.id,
        sectionName: taskMeta.section.name,
        actorId: req.userId!,
        actorName: actor?.name ?? 'Someone',
        details: { tagName: tag?.name },
      });
    }

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

    const taskMeta = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      select: { title: true, section: { select: { id: true, name: true, project: { select: { id: true } } } } },
    });
    const tag = await prisma.tag.findUnique({ where: { id: req.params.tagId as string }, select: { name: true } });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (taskMeta) {
      logActivity({
        action: 'TAG_REMOVED',
        taskId: req.params.id as string,
        taskTitle: taskMeta.title,
        projectId: taskMeta.section.project.id,
        sectionId: taskMeta.section.id,
        sectionName: taskMeta.section.name,
        actorId: req.userId!,
        actorName: actor?.name ?? 'Someone',
        details: { tagName: tag?.name },
      });
    }

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
    if (!await requireTaskAccess(req, res)) return;

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

    // Notify the newly assigned user (unless they assigned themselves)
    if (user.id !== req.userId) {
      const task = await prisma.task.findUnique({
        where: { id: req.params.id as string },
        include: { section: { include: { project: { select: { id: true, name: true } } } } },
      });
      const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
      notify({
        type: 'TASK_ASSIGNED',
        userIds: [user.id],
        actorName: actor?.name ?? 'Someone',
        taskId: req.params.id as string,
        taskTitle: task?.title,
        projectId: task?.section.project.id,
        projectName: task?.section.project.name,
      });

      if (task) {
        logActivity({
          action: 'ASSIGNEE_ADDED',
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.section.project.id,
          sectionId: task.section.id,
          sectionName: task.section.name,
          actorId: req.userId!,
          actorName: actor?.name ?? 'Someone',
          details: { assigneeName: user.name, assigneeEmail: user.email },
        });
      }
    }

    res.status(201).json(assignee);
  } catch (error) {
    console.error('Add assignee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id/assignees — list task assignees
router.get('/:id/assignees', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res, false)) return;

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
    if (!await requireTaskAccess(req, res)) return;

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
    if (!await requireTaskAccess(req, res)) return;

    const removedUserId = req.params.userId as string;
    const taskId = req.params.id as string;

    await prisma.taskAssignee.delete({
      where: { taskId_userId: { taskId, userId: removedUserId } },
    });

    // Notify the removed user (unless they removed themselves)
    if (removedUserId !== req.userId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { section: { include: { project: { select: { id: true, name: true } } } } },
      });
      const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
      notify({
        type: 'TASK_UNASSIGNED',
        userIds: [removedUserId],
        actorName: actor?.name ?? 'Someone',
        taskId,
        taskTitle: task?.title,
        projectId: task?.section.project.id,
        projectName: task?.section.project.name,
      });

      if (task) {
        const removedUser = await prisma.user.findUnique({ where: { id: removedUserId }, select: { name: true, email: true } });
        logActivity({
          action: 'ASSIGNEE_REMOVED',
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.section.project.id,
          sectionId: task.section.id,
          sectionName: task.section.name,
          actorId: req.userId!,
          actorName: actor?.name ?? 'Someone',
          details: { assigneeName: removedUser?.name, assigneeEmail: removedUser?.email },
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove assignee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Dependencies ──────────────────────────────────────

// GET /api/tasks/:id/dependencies — list task dependencies
router.get('/:id/dependencies', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res, false)) return;
    const [blockedBy, blocks] = await Promise.all([
      prisma.taskDependency.findMany({
        where: { taskId: req.params.id as string },
        include: { dependsOn: { select: { id: true, title: true, status: true } } },
      }),
      prisma.taskDependency.findMany({
        where: { dependsOnId: req.params.id as string },
        include: { task: { select: { id: true, title: true, status: true } } },
      }),
    ]);
    res.json({ blockedBy, blocks });
  } catch (error) {
    console.error('List dependencies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/dependencies — add dependency (this task is blocked by dependsOnId)
router.post('/:id/dependencies', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const { dependsOnId } = req.body;
    if (!dependsOnId) {
      res.status(400).json({ error: 'dependsOnId is required' });
      return;
    }
    const taskId = req.params.id as string;
    if (taskId === dependsOnId) {
      res.status(400).json({ error: 'A task cannot depend on itself' });
      return;
    }

    const dependsOnTask = await prisma.task.findUnique({
      where: { id: dependsOnId },
      select: { id: true, title: true, section: { select: { projectId: true } } },
    });
    if (!dependsOnTask) {
      res.status(404).json({ error: 'Dependency task not found' });
      return;
    }

    const sourceTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { section: { select: { projectId: true } } },
    });
    if (!sourceTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (sourceTask.section.projectId !== dependsOnTask.section.projectId) {
      res.status(400).json({ error: 'Dependencies must be between tasks of the same project' });
      return;
    }

    const existing = await prisma.taskDependency.findUnique({
      where: { taskId_dependsOnId: { taskId, dependsOnId } },
    });
    if (existing) {
      res.status(409).json({ error: 'Dependency already exists' });
      return;
    }

    const hasCycle = await detectCycle(taskId, dependsOnId);
    if (hasCycle) {
      res.status(400).json({ error: 'Adding this dependency would create a circular reference' });
      return;
    }

    const dep = await prisma.taskDependency.create({
      data: { taskId, dependsOnId },
      include: { dependsOn: { select: { id: true, title: true, status: true } } },
    });

    const taskMeta = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, section: { select: { id: true, name: true, project: { select: { id: true } } } } },
    });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (taskMeta) {
      logActivity({
        action: 'DEPENDENCY_ADDED',
        taskId,
        taskTitle: taskMeta.title,
        projectId: taskMeta.section.project.id,
        sectionId: taskMeta.section.id,
        sectionName: taskMeta.section.name,
        actorId: req.userId!,
        actorName: actor?.name ?? 'Someone',
        details: { dependsOnId, dependsOnTitle: dependsOnTask.title },
      });
    }

    res.status(201).json(dep);
  } catch (error) {
    console.error('Add dependency error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id/dependencies/:depId — remove dependency
router.delete('/:id/dependencies/:depId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    const dep = await prisma.taskDependency.findUnique({
      where: { id: req.params.depId as string },
      include: { dependsOn: { select: { id: true, title: true } } },
    });
    if (!dep || dep.taskId !== req.params.id) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    await prisma.taskDependency.delete({ where: { id: req.params.depId as string } });

    const taskMeta = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      select: { title: true, section: { select: { id: true, name: true, project: { select: { id: true } } } } },
    });
    const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true } });
    if (taskMeta) {
      logActivity({
        action: 'DEPENDENCY_REMOVED',
        taskId: req.params.id as string,
        taskTitle: taskMeta.title,
        projectId: taskMeta.section.project.id,
        sectionId: taskMeta.section.id,
        sectionName: taskMeta.section.name,
        actorId: req.userId!,
        actorName: actor?.name ?? 'Someone',
        details: { dependsOnId: dep.dependsOnId, dependsOnTitle: dep.dependsOn.title },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Remove dependency error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function detectCycle(taskId: string, dependsOnId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [dependsOnId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = await prisma.taskDependency.findMany({
      where: { taskId: current },
      select: { dependsOnId: true },
    });
    for (const d of deps) {
      if (d.dependsOnId === taskId) return true;
      if (!visited.has(d.dependsOnId)) queue.push(d.dependsOnId);
    }
  }
  return false;
}

// ─── Activity ───────────────────────────────────────────

// GET /api/tasks/:id/activity — list activity log for a task
router.get('/:id/activity', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res, false)) return;
    const activity = await prisma.activityLog.findMany({
      where: { taskId: req.params.id as string },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(activity);
  } catch (error) {
    console.error('List activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

