export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type ProjectRole = 'OWNER' | 'MEMBER';
export type AccessType = 'FULL' | 'EDITOR' | 'VIEWER';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  projectId: string;
}

export interface TaskTag {
  tagId: string;
  tag: Tag;
}

export interface TaskAttachment {
  id: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
  taskId: string;
  url: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  position: number;
  taskId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  status: TaskStatus;
  archived: boolean;
  position: number;
  sectionId: string;
  createdAt: string;
  updatedAt: string;
  tags: TaskTag[];
  assignees?: TaskAssignee[];
  subtasks?: Subtask[];
  _count: { comments: number; subtasks?: number };
}

export interface Section {
  id: string;
  name: string;
  description: string | null;
  color: string;
  position: number;
  archived: boolean;
  projectId: string;
  createdAt: string;
  tasks?: Task[];
  members?: SectionMember[];
  _count?: { tasks: number };
}

export interface ProjectMember {
  id: string;
  role: ProjectRole;
  accessType: AccessType;
  joinedAt: string;
  userId: string;
  user: User;
}

export interface SectionMember {
  id: string;
  accessType: AccessType;
  joinedAt: string;
  sectionId: string;
  userId: string;
  user: User;
}

export interface TaskAssignee {
  taskId: string;
  userId: string;
  accessType: AccessType;
  user: User;
}

export type MyAccessLevel = 'owner' | 'project' | 'section' | 'task';

export interface MyAccess {
  level: MyAccessLevel;
  accessType: AccessType;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  createdAt: string;
  ownerId: string;
  owner: User;
  members?: ProjectMember[];
  sections?: Section[];
  tags?: Tag[];
  myAccess?: MyAccess;
  _count?: { sections: number; members: number };
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  taskId: string;
  authorId: string;
  author: User;
}

export interface TemplateField {
  label: string;
  type: 'text' | 'checkbox' | 'select';
  required?: boolean;
  options?: string[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  fields: TemplateField[];
  projectId: string;
  sectionId: string | null;
  createdAt: string;
}

export type NotificationType =
  | 'COMMENT_ADDED'
  | 'TASK_ASSIGNED'
  | 'TASK_UNASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'MENTION';

export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actorName: string;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  meta: Record<string, unknown> | null;
}

export type DuePreset = 'all' | 'overdue' | 'today' | 'week';

export interface TaskFilters {
  statuses: TaskStatus[];
  assigneeId: string | null;
  tagId: string | null;
  duePreset: DuePreset;
}

export const DEFAULT_FILTERS: TaskFilters = {
  statuses: [],
  assigneeId: null,
  tagId: null,
  duePreset: 'all',
};

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
  | 'ATTACHMENT_DELETED';

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  createdAt: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  sectionId: string | null;
  sectionName: string | null;
  actorId: string;
  actorName: string;
  details: Record<string, unknown> | null;
}
