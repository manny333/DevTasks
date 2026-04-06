import prisma from './prisma';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';

export type EffectiveAccess = 'OWNER' | 'FULL' | 'EDITOR' | 'VIEWER' | null;

/**
 * Resolves the effective access level for a user on a given project.
 * Resolution order: owner > ProjectMember > SectionMember > TaskAssignee
 */
export async function getProjectAccess(
  userId: string,
  projectId: string
): Promise<EffectiveAccess> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  if (project.ownerId === userId) return 'OWNER';

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (membership) return membership.accessType as EffectiveAccess;

  const sectionAccess = await prisma.sectionMember.findFirst({
    where: { userId, section: { projectId } },
    orderBy: { accessType: 'asc' }, // EDITOR < FULL < VIEWER alphabetically — we pick best below
  });
  if (sectionAccess) {
    // Return best section-level access
    const all = await prisma.sectionMember.findMany({
      where: { userId, section: { projectId } },
      select: { accessType: true },
    });
    if (all.some((a) => a.accessType === 'FULL')) return 'FULL';
    if (all.some((a) => a.accessType === 'EDITOR')) return 'EDITOR';
    return 'VIEWER';
  }

  const taskAccess = await prisma.taskAssignee.findFirst({
    where: { userId, task: { section: { projectId } } },
  });
  if (taskAccess) {
    const all = await prisma.taskAssignee.findMany({
      where: { userId, task: { section: { projectId } } },
      select: { accessType: true },
    });
    if (all.some((a) => a.accessType === 'FULL')) return 'FULL';
    if (all.some((a) => a.accessType === 'EDITOR')) return 'EDITOR';
    return 'VIEWER';
  }

  return null;
}

/**
 * Resolves the effective access for a user on a specific task,
 * considering task-level override first, then section, then project.
 */
export async function getTaskAccess(
  userId: string,
  taskId: string
): Promise<EffectiveAccess> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { section: { select: { projectId: true } } },
  });
  if (!task) return null;

  const projectId = task.section.projectId;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  if (project.ownerId === userId) return 'OWNER';

  // Project-level membership takes full priority
  const projectMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (projectMembership) return projectMembership.accessType as EffectiveAccess;

  // Take the BEST access across task-level and section-level (never downgrade)
  const ACCESS_RANK: Record<string, number> = { FULL: 3, EDITOR: 2, VIEWER: 1 };
  let best: EffectiveAccess = null;

  const taskAssignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  if (taskAssignee) {
    const a = taskAssignee.accessType as EffectiveAccess;
    if (!best || ACCESS_RANK[a!] > ACCESS_RANK[best]) best = a;
  }

  const sectionAccess = await prisma.sectionMember.findUnique({
    where: { sectionId_userId: { sectionId: task.sectionId, userId } },
  });
  if (sectionAccess) {
    const a = sectionAccess.accessType as EffectiveAccess;
    if (!best || ACCESS_RANK[a!] > ACCESS_RANK[best]) best = a;
  }

  return best;
}

/** Returns true if the access level allows mutations (create/edit/delete/move) */
export function canEdit(access: EffectiveAccess): boolean {
  return access === 'OWNER' || access === 'FULL' || access === 'EDITOR';
}

/**
 * Middleware factory: resolves task access for req.params.id and rejects if below minAccess.
 * Attaches resolved access to req.effectiveAccess.
 */
export async function requireTaskAccess(
  req: AuthRequest,
  res: Response,
  minEdit = true
): Promise<EffectiveAccess | null> {
  const access = await getTaskAccess(req.userId!, req.params.id as string);
  if (!access) {
    res.status(403).json({ error: 'No access to this task' });
    return null;
  }
  if (minEdit && !canEdit(access)) {
    res.status(403).json({ error: 'You have read-only access to this task' });
    return null;
  }
  return access;
}

/**
 * Resolves section access for a given section ID.
 */
export async function getSectionAccess(
  userId: string,
  sectionId: string
): Promise<EffectiveAccess> {
  const section = await prisma.section.findUnique({ where: { id: sectionId } });
  if (!section) return null;
  return getProjectAccess(userId, section.projectId);
}
