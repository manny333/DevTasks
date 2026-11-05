import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { ensureProjectAccess } from '../lib/access';

const router = Router();
router.use(authMiddleware);

async function getTagProjectId(tagId: string): Promise<string | null> {
  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    select: { projectId: true },
  });
  return tag?.projectId ?? null;
}

// POST /api/projects/:projectId/tags — create tag
router.post('/:projectId/tags', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await ensureProjectAccess(req.userId!, req.params.projectId as string, res, true)) return;

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
    if (!await ensureProjectAccess(req.userId!, req.params.projectId as string, res, false)) return;

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
    const projectId = await getTagProjectId(req.params.id as string);
    if (!projectId) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    if (!await ensureProjectAccess(req.userId!, projectId, res, true)) return;

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
    const projectId = await getTagProjectId(req.params.id as string);
    if (!projectId) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }
    if (!await ensureProjectAccess(req.userId!, projectId, res, true)) return;

    await prisma.tag.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
