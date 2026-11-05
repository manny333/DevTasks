/**
 * Canonical API contract for Kanvy.
 *
 * This file is the single source of truth for the values that cross the
 * frontend/backend boundary. It is validated against both sides by
 * `node devtasks/shared/check.mjs` (run in CI), so a rename in the Prisma
 * schema or in the frontend types fails the build instead of drifting silently.
 */

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export type ProjectRole = 'OWNER' | 'MEMBER';

export type AccessType = 'FULL' | 'EDITOR' | 'VIEWER';

export type MyAccessLevel = 'owner' | 'project' | 'section' | 'task';

export type NotificationType =
  | 'COMMENT_ADDED'
  | 'TASK_ASSIGNED'
  | 'TASK_UNASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'MENTION';

export type ActivityAction =
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_MOVED_SECTION'
  | 'TASK_ARCHIVED'
  | 'TASK_UNARCHIVED'
  | 'TASK_DELETED'
  | 'COMMENT_ADDED'
  | 'COMMENT_DELETED'
  | 'SUBTASK_ADDED'
  | 'SUBTASK_COMPLETED'
  | 'SUBTASK_UNCOMPLETED'
  | 'SUBTASK_DELETED'
  | 'ASSIGNEE_ADDED'
  | 'ASSIGNEE_REMOVED'
  | 'TAG_ADDED'
  | 'TAG_REMOVED'
  | 'ATTACHMENT_UPLOADED'
  | 'ATTACHMENT_DELETED'
  | 'DEPENDENCY_ADDED'
  | 'DEPENDENCY_REMOVED';

/** Shapes returned by GET /api/projects/:slug. */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  ownerId: string;
  createdAt: string;
  myAccess?: { level: MyAccessLevel; accessType: AccessType };
}

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  archived: boolean;
  position: number;
  sectionId: string;
  startDate?: string | null;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SectionSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  archived: boolean;
  projectId: string;
}

export interface ApiError {
  error: string;
}
