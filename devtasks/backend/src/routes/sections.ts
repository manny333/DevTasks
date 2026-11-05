import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  getProjectScope,
  getSectionAccess,
  canManageAccess,
  ensureProjectAccess,
  requireSectionAccess,
} from '../lib/access';

const router = Router();
router.use(authMiddleware);

/** Section member management requires FULL (or OWNER) on that section. */
async function requireSectionManager(req: AuthRequest, res: Response): Promise<boolean> {
  const access = await getSectionAccess(req.userId!, req.params.id as string);
  if (!access) {
    res.status(403).json({ error: 'No access to this section' });
    return false;
  }
  if (!canManageAccess(access)) {
    res.status(403).json({ error: 'Only full members can manage section access' });
    return false;
  }
  return true;
}

// POST /api/projects/:projectId/sections — create section
router.post('/:projectId/sections', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await ensureProjectAccess(req.userId!, req.params.projectId as string, res, true)) return;

    const { name, description, color } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    // Get max position
    const last = await prisma.section.findFirst({
      where: { projectId: req.params.projectId as string },
      orderBy: { position: 'desc' },
    });

    const section = await prisma.section.create({
      data: {
        name: name.trim(),
        description: description || null,
        color: color || '#6366f1',
        position: (last?.position ?? -1) + 1,
        projectId: req.params.projectId as string,
      },
    });
    res.status(201).json(section);
  } catch (error) {
    console.error('Create section error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/sections — list sections
router.get('/:projectId/sections', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = await getProjectScope(req.userId!, req.params.projectId as string);
    if (!scope) {
      res.status(403).json({ error: 'No access to this project' });
      return;
    }

    const sections = await prisma.section.findMany({
      where: { projectId: req.params.projectId as string },
      include: { _count: { select: { tasks: true } } },
      orderBy: { position: 'asc' },
    });

    if (scope.all) {
      res.json(sections);
      return;
    }

    // Section-level grants see their sections; task-level grants also see the
    // section that contains their task, so the board can navigate to it.
    const allowed = new Set(scope.sectionIds);
    if (scope.taskIds.length > 0) {
      const rows = await prisma.task.findMany({
        where: { id: { in: scope.taskIds } },
        select: { sectionId: true },
      });
      for (const row of rows) allowed.add(row.sectionId);
    }

    res.json(sections.filter((section) => allowed.has(section.id)));
  } catch (error) {
    console.error('List sections error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/sections/:id — update section
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionAccess(req, res, { param: 'id' })) return;

    const { name, description, color } = req.body;
    const updated = await prisma.section.update({
      where: { id: req.params.id as string },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(color !== undefined && { color }),
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/sections/:id/archive — toggle archived
router.patch('/:id/archive', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionAccess(req, res, { param: 'id' })) return;

    const section = await prisma.section.findUnique({ where: { id: req.params.id as string } });
    if (!section) { res.status(404).json({ error: 'Section not found' }); return; }

    const updated = await prisma.section.update({
      where: { id: req.params.id as string },
      data: { archived: !section.archived },
    });
    res.json(updated);
  } catch (error) {
    console.error('Archive section error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/sections/:id — delete section
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionAccess(req, res, { param: 'id' })) return;

    await prisma.section.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/projects/:projectId/sections/reorder — reorder sections
router.put('/:projectId/sections/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await ensureProjectAccess(req.userId!, req.params.projectId as string, res, true)) return;

    const { order } = req.body; // array of section IDs in new order
    if (!Array.isArray(order)) {
      res.status(400).json({ error: 'order must be an array of section IDs' });
      return;
    }

    // Ensure all IDs belong to this project
    const existing = await prisma.section.findMany({
      where: { projectId: req.params.projectId as string },
      select: { id: true },
    });
    const validIds = new Set(existing.map(s => s.id));
    if (order.some((id: string) => !validIds.has(id))) {
      res.status(400).json({ error: 'Invalid section IDs in order' });
      return;
    }

    await prisma.$transaction(
      order.map((id: string, index: number) =>
        prisma.section.update({ where: { id }, data: { position: index } })
      )
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Reorder sections error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Section Members ────────────────────────────────────────────

// POST /api/sections/:id/members — grant section access to a user by email
router.post('/:id/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionManager(req, res)) return;

    const { email, accessType = 'VIEWER' } = req.body;
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }
    if (!['FULL', 'EDITOR', 'VIEWER'].includes(accessType)) {
      res.status(400).json({ error: 'Invalid accessType' }); return;
    }

    const section = await prisma.section.findUnique({ where: { id: req.params.id as string } });
    if (!section) { res.status(404).json({ error: 'Section not found' }); return; }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    const existing = await prisma.sectionMember.findUnique({
      where: { sectionId_userId: { sectionId: req.params.id as string, userId: user.id } },
    });
    if (existing) { res.status(409).json({ error: 'User already has access to this section' }); return; }

    const member = await prisma.sectionMember.create({
      data: { sectionId: req.params.id as string, userId: user.id, accessType },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.status(201).json(member);
  } catch (error) {
    console.error('Add section member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sections/:id/members — list section members
router.get('/:id/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionAccess(req, res, { param: 'id', minEdit: false })) return;

    const members = await prisma.sectionMember.findMany({
      where: { sectionId: req.params.id as string },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(members);
  } catch (error) {
    console.error('List section members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/sections/:id/members/:userId — update section member accessType
router.patch('/:id/members/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionManager(req, res)) return;

    const { accessType } = req.body;
    if (!['FULL', 'EDITOR', 'VIEWER'].includes(accessType)) {
      res.status(400).json({ error: 'Invalid accessType' }); return;
    }
    const updated = await prisma.sectionMember.update({
      where: { sectionId_userId: { sectionId: req.params.id as string, userId: req.params.userId as string } },
      data: { accessType },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update section member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/sections/:id/members/:userId — remove section member
router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireSectionManager(req, res)) return;

    await prisma.sectionMember.delete({
      where: { sectionId_userId: { sectionId: req.params.id as string, userId: req.params.userId as string } },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove section member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
