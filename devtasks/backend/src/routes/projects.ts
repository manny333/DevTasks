import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const SECTION_TEMPLATES: Record<string, { name: string; color: string }[]> = {
  software: [
    { name: 'Daily Focus', color: '#6366f1' },
    { name: 'Backlog',     color: '#94a3b8' },
    { name: 'In Progress', color: '#f59e0b' },
    { name: 'Bugs',        color: '#ef4444' },
    { name: 'Done',        color: '#22c55e' },
  ],
  personal: [
    { name: 'Daily Focus', color: '#6366f1' },
    { name: 'This Week',   color: '#f59e0b' },
    { name: 'Someday',     color: '#94a3b8' },
    { name: 'Done',        color: '#22c55e' },
  ],
  marketing: [
    { name: 'Ideas',       color: '#8b5cf6' },
    { name: 'In Progress', color: '#f59e0b' },
    { name: 'Review',      color: '#06b6d4' },
    { name: 'Published',   color: '#22c55e' },
  ],
};

// POST /api/projects — create project
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, template } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    let slug = slugify(name);
    // Ensure unique slug
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description || null,
        slug,
        ownerId: req.userId!,
        members: {
          create: { userId: req.userId!, role: 'OWNER' },
        },
      },
      include: { owner: { select: { id: true, name: true, avatar: true } } },
    });

    // Create sections from template
    const sections = SECTION_TEMPLATES[template as string] ?? [];
    if (sections.length > 0) {
      await prisma.$transaction(
        sections.map((sec, index) =>
          prisma.section.create({
            data: {
              name: sec.name,
              color: sec.color,
              position: index,
              projectId: project.id,
            },
          })
        )
      );
    }

    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: resolve myAccess for a user on a project
async function resolveMyAccess(project: { id: string; ownerId: string }, userId: string) {
  if (project.ownerId === userId) return { level: 'owner', accessType: 'FULL' as const };
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId } },
  });
  if (membership) return { level: 'project', accessType: membership.accessType };
  // Check section membership
  const sectionAccess = await prisma.sectionMember.findFirst({
    where: { userId, section: { projectId: project.id } },
  });
  if (sectionAccess) return { level: 'section', accessType: sectionAccess.accessType };
  // Check task assignee
  const taskAccess = await prisma.taskAssignee.findFirst({
    where: { userId, task: { section: { projectId: project.id } } },
  });
  if (taskAccess) return { level: 'task', accessType: taskAccess.accessType };
  return null;
}

// GET /api/projects — list my projects
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    // Projects where user is a direct member
    const directProjects = await prisma.project.findMany({
      where: { members: { some: { userId } } },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        _count: { select: { sections: true, members: true } },
        members: { where: { userId }, select: { accessType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Projects where user has section or task access (not already a direct member)
    const directProjectIds = directProjects.map((p) => p.id);
    const sectionProjects = await prisma.project.findMany({
      where: {
        id: { notIn: directProjectIds },
        sections: {
          some: {
            OR: [
              { members: { some: { userId } } },
              { tasks: { some: { assignees: { some: { userId } } } } },
            ],
          },
        },
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        _count: { select: { sections: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withAccess = [
      ...directProjects.map((p) => ({
        ...p,
        myAccess: p.ownerId === userId
          ? { level: 'owner', accessType: 'FULL' }
          : { level: 'project', accessType: p.members[0]?.accessType ?? 'VIEWER' },
        members: undefined,
      })),
      ...await Promise.all(
        sectionProjects.map(async (p) => ({ ...p, myAccess: await resolveMyAccess(p, userId) }))
      ),
    ];

    res.json(withAccess);
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:slug — get project by slug
router.get('/:slug', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const project = await prisma.project.findUnique({
      where: { slug: req.params.slug as string },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
        },
        sections: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              include: {
                tags: { include: { tag: true } },
                assignees: { include: { user: { select: { id: true, name: true, avatar: true, email: true } } } },
                subtasks: { orderBy: { position: 'asc' } },
                _count: { select: { comments: true, subtasks: true } },
              },
            },
            members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
          },
        },
        tags: true,
      },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const myAccess = await resolveMyAccess(project, userId);
    if (!myAccess) {
      res.status(403).json({ error: 'Not a member of this project' });
      return;
    }

    res.json({ ...project, myAccess });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:id — update project
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const project = await prisma.project.findUnique({ where: { id: req.params.id as string } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (project.ownerId !== req.userId) {
      res.status(403).json({ error: 'Only the owner can update this project' });
      return;
    }

    const updated = await prisma.project.update({
      where: { id: req.params.id as string },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description }),
      },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id — delete project
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id as string } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (project.ownerId !== req.userId) {
      res.status(403).json({ error: 'Only the owner can delete this project' });
      return;
    }

    await prisma.project.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Members ────────────────────────────────────────────

// Helper: check if user can manage project members (owner or FULL member)
async function canManageMembers(projectId: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  if (project.ownerId === userId) return true;
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return membership?.accessType === 'FULL';
}

// POST /api/projects/:id/members — invite member by email
router.post('/:id/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, accessType = 'FULL' } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    if (!['FULL', 'EDITOR', 'VIEWER'].includes(accessType)) {
      res.status(400).json({ error: 'Invalid accessType' });
      return;
    }

    if (!(await canManageMembers(req.params.id as string, req.userId!))) {
      res.status(403).json({ error: 'Only the owner or full members can invite' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'User not found. They must sign in at least once.' });
      return;
    }

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: req.params.id as string, userId: user.id } },
    });
    if (existing) {
      res.status(409).json({ error: 'User is already a member' });
      return;
    }

    const member = await prisma.projectMember.create({
      data: { projectId: req.params.id as string, userId: user.id, role: 'MEMBER', accessType },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.status(201).json(member);
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:id/members/:userId — update member accessType
router.patch('/:id/members/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accessType } = req.body;
    if (!['FULL', 'EDITOR', 'VIEWER'].includes(accessType)) {
      res.status(400).json({ error: 'Invalid accessType' });
      return;
    }
    if (!(await canManageMembers(req.params.id as string, req.userId!))) {
      res.status(403).json({ error: 'Only the owner or full members can update access' });
      return;
    }
    const updated = await prisma.projectMember.update({
      where: { projectId_userId: { projectId: req.params.id as string, userId: req.params.userId as string } },
      data: { accessType },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id/members — list members
router.get('/:id/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const members = await prisma.projectMember.findMany({
      where: { projectId: req.params.id as string },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json(members);
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id/members/:userId — remove member
router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await canManageMembers(req.params.id as string, req.userId!))) {
      res.status(403).json({ error: 'Only the owner or full members can remove members' });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: req.params.id as string } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (req.params.userId as string === req.userId) {
      res.status(400).json({ error: 'Cannot remove yourself' });
      return;
    }

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: req.params.id as string, userId: req.params.userId as string } },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

