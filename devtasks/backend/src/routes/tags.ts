import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// POST /api/projects/:projectId/tags — create tag
router.post('/:projectId/tags', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        color: color || '#6366f1',
        projectId: req.params.projectId as string,
      },
    });
    res.status(201).json(tag);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      res.status(409).json({ error: 'Tag name already exists in this project' });
      return;
    }
    console.error('Create tag error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/tags — list tags
router.get('/:projectId/tags', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tags = await prisma.tag.findMany({
      where: { projectId: req.params.projectId as string },
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch (error) {
    console.error('List tags error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tags/:id — update tag
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, color } = req.body;
    const updated = await prisma.tag.update({
      where: { id: req.params.id as string },
      data: {
        ...(name && { name: name.trim() }),
        ...(color && { color }),
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tags/:id — delete tag
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.tag.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

