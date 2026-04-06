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

    // Projects the user belongs to
    const memberProjects = await prisma.projectMember.findMany({
      where: { userId: req.userId },
      select: { projectId: true },
    });
    const projectIds = memberProjects.map((m) => m.projectId);

    const [tasks, projects] = await Promise.all([
      prisma.task.findMany({
        where: {
          archived: false,
          section: { projectId: { in: projectIds } },
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
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
