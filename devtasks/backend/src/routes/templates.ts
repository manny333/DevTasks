import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// POST /api/projects/:projectId/templates — create template
router.post('/:projectId/templates', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, sectionId, fields } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const template = await prisma.taskTemplate.create({
      data: {
        name: name.trim(),
        description: description || null,
        fields: fields || [],
        projectId: req.params.projectId as string,
        sectionId: sectionId || null,
      },
    });
    res.status(201).json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/templates — list templates
router.get('/:projectId/templates', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await prisma.taskTemplate.findMany({
      where: { projectId: req.params.projectId as string },
      orderBy: { name: 'asc' },
    });
    res.json(templates);
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/templates/:id — update template
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, fields, sectionId } = req.body;
    const updated = await prisma.taskTemplate.update({
      where: { id: req.params.id as string },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(fields !== undefined && { fields }),
        ...(sectionId !== undefined && { sectionId: sectionId || null }),
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/templates/:id — delete template
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.taskTemplate.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

