import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// POST /api/tasks/:taskId/comments — create comment
router.post('/:taskId/comments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        taskId: req.params.taskId as string,
        authorId: req.userId!,
      },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    });
    res.status(201).json(comment);
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:taskId/comments — list comments
router.get('/:taskId/comments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comments = await prisma.comment.findMany({
      where: { taskId: req.params.taskId as string },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (error) {
    console.error('List comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:taskId/comments/:id — delete comment (only author)
router.delete('/:taskId/comments/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id as string } });
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }
    if (comment.authorId !== req.userId) {
      res.status(403).json({ error: 'Can only delete your own comments' });
      return;
    }
    await prisma.comment.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

