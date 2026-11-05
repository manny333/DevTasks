import prisma from './prisma';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';

export type EffectiveAccess = 'OWNER' | 'FULL' | 'EDITOR' | 'VIEWER' | null;

const ACCESS_RANK: Record<string, number> = { FULL: 3, EDITOR: 2, VIEWER: 1 };

/** Returns the highest of two access levels (never downgrades). */
function bestAccess(a: EffectiveAccess, b: EffectiveAccess): EffectiveAccess {
  if (!a) return b;
  if (!b) return a;
  return (ACCESS_RANK[a] ?? 0) >= (ACCESS_RANK[b] ?? 0) ? a : b;
}

/**
 * Access granted strictly at project level: owner or a ProjectMember row.
 * Section/task grants do NOT count here — see getProjectScope and getSectionAccess.
 * Project-wide mutations (create/delete/reorder sections, invites) must use this.
 */
export async function getProjectAccess(
  userId: string,
  projectId: string
): Promise<EffectiveAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) return null;
  if (project.ownerId === userId) return 'OWNER';

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { accessType: true },
  });
  return membership ? (membership.accessType as EffectiveAccess) : null;
}

export interface ProjectScope {
  /** How the access was granted: owner > project > section > task */
  level: 'owner' | 'project' | 'section' | 'task';
  accessType: 'FULL' | 'EDITOR' | 'VIEWER';
  /** true when the user may read the whole project */
  all: boolean;
  /** sections the user may read in full (empty when all === true) */
  sectionIds: string[];
  /** individual tasks the user may read (empty when all === true) */
  taskIds: string[];
}

/**
 * Resolves everything the user is allowed to READ inside a project.
 * Returns null when the user has no access at all.
 */
export async function getProjectScope(
  userId: string,
  projectId: string
): Promise<ProjectScope | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) return null;

  if (project.ownerId === userId) {
    return { level: 'owner', accessType: 'FULL', all: true, sectionIds: [], taskIds: [] };
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { accessType: true },
  });
  if (membership) {
    return {
      level: 'project',
      accessType: membership.accessType as ProjectScope['accessType'],
      all: true,
      sectionIds: [],
      taskIds: [],
    };
  }

  const [sectionRows, taskRows] = await Promise.all([
    prisma.sectionMember.findMany({
      where: { userId, section: { projectId } },
      select: { sectionId: true, accessType: true },
    }),
    prisma.taskAssignee.findMany({
      where: { userId, task: { section: { projectId } } },
      select: { taskId: true, accessType: true },
    }),
  ]);

  if (sectionRows.length === 0 && taskRows.length === 0) return null;

  let best: EffectiveAccess = null;
  for (const row of sectionRows) best = bestAccess(best, row.accessType as EffectiveAccess);
  for (const row of taskRows) best = bestAccess(best, row.accessType as EffectiveAccess);

  return {
    level: sectionRows.length > 0 ? 'section' : 'task',
    accessType: (best ?? 'VIEWER') as ProjectScope['accessType'],
    all: false,
    sectionIds: [...new Set(sectionRows.map((row) => row.sectionId))],
    taskIds: [...new Set(taskRows.map((row) => row.taskId))],
  };
}

/**
 * Resolves the effective access for a user on a specific task:
 * project level wins, otherwise the best of task-level and section-level grants.
 */
export async function getTaskAccess(
  userId: string,
  taskId: string
): Promise<EffectiveAccess> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { sectionId: true, section: { select: { projectId: true } } },
  });
  if (!task) return null;

  const project = await prisma.project.findUnique({
    where: { id: task.section.projectId },
    select: { ownerId: true },
  });
  if (!project) return null;
  if (project.ownerId === userId) return 'OWNER';

  const projectMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: task.section.projectId, userId } },
    select: { accessType: true },
  });
  if (projectMembership) return projectMembership.accessType as EffectiveAccess;

  let best: EffectiveAccess = null;

  const taskAssignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: { accessType: true },
  });
  if (taskAssignee) best = bestAccess(best, taskAssignee.accessType as EffectiveAccess);

  const sectionAccess = await prisma.sectionMember.findUnique({
    where: { sectionId_userId: { sectionId: task.sectionId, userId } },
    select: { accessType: true },
  });
  if (sectionAccess) best = bestAccess(best, sectionAccess.accessType as EffectiveAccess);

  return best;
}

/**
 * Access for one section. Project membership only applies when it exists at
 * project level; a grant on another section never leaks into this one.
 */
export async function getSectionAccess(
  userId: string,
  sectionId: string
): Promise<EffectiveAccess> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { projectId: true },
  });
  if (!section) return null;

  const project = await prisma.project.findUnique({
    where: { id: section.projectId },
    select: { ownerId: true },
  });
  if (!project) return null;
  if (project.ownerId === userId) return 'OWNER';

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: section.projectId, userId } },
    select: { accessType: true },
  });
  if (membership) return membership.accessType as EffectiveAccess;

  const sectionAccess = await prisma.sectionMember.findUnique({
    where: { sectionId_userId: { sectionId, userId } },
    select: { accessType: true },
  });
  if (sectionAccess) return sectionAccess.accessType as EffectiveAccess;

  const taskAccess = await prisma.taskAssignee.findFirst({
    where: { userId, task: { sectionId } },
    select: { accessType: true },
  });
  return taskAccess ? (taskAccess.accessType as EffectiveAccess) : null;
}

/** Returns true if the access level allows mutations (create/edit/delete/move). */
export function canEdit(access: EffectiveAccess): boolean {
  return access === 'OWNER' || access === 'FULL' || access === 'EDITOR';
}

/** Returns true if the access level allows managing member grants. */
export function canManageAccess(access: EffectiveAccess): boolean {
  return access === 'OWNER' || access === 'FULL';
}

// ─── Guards ────────────────────────────────────────────────────────────────
// Return true when the request may continue; otherwise the response is sent.

function denied(res: Response, message: string): false {
  res.status(403).json({ error: message });
  return false;
}

export async function ensureProjectAccess(
  userId: string,
  projectId: string | undefined,
  res: Response,
  minEdit = true
): Promise<boolean> {
  if (!projectId) {
    res.status(400).json({ error: 'Project id is required' });
    return false;
  }
  const access = await getProjectAccess(userId, projectId);
  if (!access) return denied(res, 'No access to this project');
  if (minEdit && !canEdit(access)) return denied(res, 'You have read-only access to this project');
  return true;
}

export async function ensureSectionAccess(
  userId: string,
  sectionId: string | undefined,
  res: Response,
  minEdit = true
): Promise<boolean> {
  if (!sectionId) {
    res.status(400).json({ error: 'Section id is required' });
    return false;
  }
  const access = await getSectionAccess(userId, sectionId);
  if (!access) return denied(res, 'No access to this section');
  if (minEdit && !canEdit(access)) return denied(res, 'You have read-only access to this section');
  return true;
}

export interface GuardOptions {
  /** Route param that holds the id (default: projectId / sectionId). */
  param?: string;
  /** When true the caller must be able to mutate (default: true). */
  minEdit?: boolean;
}

export async function requireProjectAccess(
  req: AuthRequest,
  res: Response,
  opts: GuardOptions = {}
): Promise<boolean> {
  const param = opts.param ?? 'projectId';
  return ensureProjectAccess(
    req.userId!,
    req.params[param] as string | undefined,
    res,
    opts.minEdit ?? true
  );
}

export async function requireSectionAccess(
  req: AuthRequest,
  res: Response,
  opts: GuardOptions = {}
): Promise<boolean> {
  const param = opts.param ?? 'sectionId';
  return ensureSectionAccess(
    req.userId!,
    req.params[param] as string | undefined,
    res,
    opts.minEdit ?? true
  );
}

/**
 * Middleware-style helper for task routes. `param` defaults to `id` because most
 * task routes live under `/api/tasks/:id`; comments use `taskId`.
 */
export async function requireTaskAccess(
  req: AuthRequest,
  res: Response,
  minEdit = true,
  param = 'id'
): Promise<EffectiveAccess | null> {
  const access = await getTaskAccess(req.userId!, req.params[param] as string);
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
