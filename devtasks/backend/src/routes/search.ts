import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

function clampLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '10'), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 10, 1), 20);
}

// GET /api/search?q=query — universal search across accessible project knowledge
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = clampLimit(req.query.limit);
    if (q.length < 2) {
      res.json({ tasks: [], projects: [], documents: [], comments: [], people: [] });
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
    const taskAccess = {
      OR: [
        { section: { projectId: { in: fullProjectIds } } },
        { sectionId: { in: sectionIds } },
        { id: { in: taskIds } },
      ],
    };

    const [tasks, projects, documents, comments, people] = await Promise.all([
      prisma.task.findMany({
        where: {
          archived: false,
          AND: [
            taskAccess,
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { context: { contains: q, mode: 'insensitive' } },
                { acceptanceCriteria: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          status: true,
          context: true,
          section: {
            select: {
              id: true,
              name: true,
              project: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        take: limit,
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
        take: Math.min(limit, 5),
      }),
      prisma.projectDocument.findMany({
        where: {
          projectId: { in: fullProjectIds },
          isArchived: false,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          project: { select: { name: true, slug: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      prisma.comment.findMany({
        where: {
          content: { contains: q, mode: 'insensitive' },
          task: {
            archived: false,
            OR: [
              { section: { projectId: { in: fullProjectIds } } },
              { sectionId: { in: sectionIds } },
              { id: { in: taskIds } },
            ],
          },
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: { select: { name: true } },
          task: {
            select: {
              id: true,
              title: true,
              section: { select: { project: { select: { name: true, slug: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.user.findMany({
        where: {
          AND: [
            {
              OR: [
                { memberships: { some: { projectId: { in: fullProjectIds } } } },
                { ownedProjects: { some: { id: { in: fullProjectIds } } } },
              ],
            },
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          memberships: {
            where: { projectId: { in: fullProjectIds } },
            select: { project: { select: { name: true, slug: true } } },
            take: 1,
          },
          ownedProjects: {
            where: { id: { in: fullProjectIds } },
            select: { name: true, slug: true },
            take: 1,
          },
        },
        take: limit,
      }),
    ]);

    res.json({
      tasks,
      projects,
      documents,
      comments,
      people: people.map((person) => {
        const project = person.memberships[0]?.project ?? person.ownedProjects[0] ?? null;
        const { memberships: _memberships, ownedProjects: _owned, ...rest } = person;
        return { ...rest, project };
      }),
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
