import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireProjectAccess } from '../lib/access';

const router = Router();
router.use(authMiddleware);

const TEXT_LIMITS: Record<string, number> = {
  purpose: 4000,
  repoUrl: 1000,
  defaultBranch: 200,
  stack: 4000,
  setupCommands: 10000,
  runCommands: 10000,
  testCommands: 10000,
  deployUrl: 1000,
  stagingUrl: 1000,
  owners: 2000,
  onCall: 1000,
  startHere: 10000,
};

const FIELDS = Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[];

const PROFILE_SELECT = {
  id: true,
  projectId: true,
  purpose: true,
  repoUrl: true,
  defaultBranch: true,
  stack: true,
  setupCommands: true,
  runCommands: true,
  testCommands: true,
  deployUrl: true,
  stagingUrl: true,
  owners: true,
  onCall: true,
  startHere: true,
  updatedById: true,
  updatedBy: { select: { id: true, name: true, email: true } },
  createdAt: true,
  updatedAt: true,
} as const;

function clean(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > TEXT_LIMITS[field]) return undefined;
  return trimmed;
}

// GET /api/projects/:projectId/profile
router.get('/:projectId/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    const projectId = req.params.projectId as string;
    const profile = await prisma.projectProfile.findUnique({
      where: { projectId },
      select: PROFILE_SELECT,
    });
    res.json(profile ?? {
      projectId,
      purpose: null,
      repoUrl: null,
      defaultBranch: null,
      stack: null,
      setupCommands: null,
      runCommands: null,
      testCommands: null,
      deployUrl: null,
      stagingUrl: null,
      owners: null,
      onCall: null,
      startHere: null,
      updatedById: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
    });
  } catch (error) {
    console.error('Get project profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:projectId/profile
router.patch('/:projectId/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res)) return;
    const projectId = req.params.projectId as string;
    const data: Record<string, string | null> = {};

    const body = (req.body ?? {}) as Record<string, unknown>;
    for (const field of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const value = clean(body[field], field);
      if (value === undefined) {
        res.status(400).json({ error: `${field} is invalid or too long` });
        return;
      }
      data[field] = value;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Provide at least one profile field' });
      return;
    }

    const profile = await prisma.projectProfile.upsert({
      where: { projectId },
      update: { ...data, updatedById: req.userId! },
      create: {
        projectId,
        ...data,
        updatedById: req.userId!,
      },
      select: PROFILE_SELECT,
    });
    res.json(profile);
  } catch (error) {
    console.error('Update project profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/passport — project + profile in one read
router.get('/:projectId/passport', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    const projectId = req.params.projectId as string;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, slug: true, description: true, createdAt: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const profile = await prisma.projectProfile.findUnique({
      where: { projectId },
      select: PROFILE_SELECT,
    });
    res.json({ project, profile });
  } catch (error) {
    console.error('Get project passport error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
