import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /api/search?q=query — search tasks and projects for the current user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
      res.json({ tasks: [], projects: [] });
      return;
    }

    const userId = req.userId!;

    // Projects the user can open: owner, project member, section member or task assignee.
    const accessibleProjects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
          { sections: { some: { members: { some: { userId } } } } },
          { sections: { some: { tasks: { some: { assignees: { some: { userId } } } } } } },
        ],
      },
      select: { id: true },
    });
    const projectIds = accessibleProjects.map((project) => project.id);

    // Full-project visibility (owner or project member) vs section/task grants.
    const [memberships, ownedProjects, sectionMemberships, taskAssignments] = await Promise.all([
      prisma.projectMember.findMany({ where: { userId }, select: { projectId: true } }),
      prisma.project.findMany({ where: { ownerId: userId }, select: { id: true } }),
      prisma.sectionMember.findMany({ where: { userId }, select: { sectionId: true } }),
      prisma.taskAssignee.findMany({ where: { userId }, select: { taskId: true } }),
    ]);

    const fullProjectIds = [...new Set([
      ...memberships.map((member) => member.projectId),
      ...ownedProjects.map((project) => project.id),
    ])];
    const sectionIds = sectionMemberships.map((member) => member.sectionId);
    const taskIds = taskAssignments.map((assignment) => assignment.taskId);

    const [tasks, projects] = await Promise.all([
      prisma.task.findMany({
        where: {
          archived: false,
          AND: [
            {
              OR: [
                { section: { projectId: { in: fullProjectIds } } },
                { sectionId: { in: sectionIds } },
                { id: { in: taskIds } },
              ],
            },
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          section: {
            select: {
              id: true,
              name: true,
              project: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        take: 10,
      }),
      prisma.project.findMany({
        where: {
          id: { in: projectIds },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, slug: true, description: true },
        take: 5,
      }),
    ]);

    res.json({ tasks, projects });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
