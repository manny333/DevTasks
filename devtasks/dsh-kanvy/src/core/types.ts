export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

export interface MyAccess {
  level: 'owner' | 'project' | 'section' | 'task' | string;
  accessType: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  ownerId?: string;
  myAccess?: MyAccess;
  _count?: { sections?: number; members?: number };
}

export interface TaskSummary {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  archived?: boolean;
  sectionId?: string;
  startDate?: string | null;
  dueDate?: string | null;
  assignees?: { user?: { name?: string } }[];
  subtasks?: { title?: string; completed?: boolean }[];
  tags?: { tag?: { name?: string } }[];
  blockedBy?: { dependsOn?: { id: string; title: string; status: TaskStatus } }[];
  _count?: { comments?: number; subtasks?: number };
}

export interface SectionSummary {
  id: string;
  name: string;
  color?: string;
  archived?: boolean;
  position?: number;
  tasks?: TaskSummary[];
  _count?: { tasks?: number };
}

export interface ProjectDetail extends ProjectSummary {
  sections?: SectionSummary[];
  tags?: { name?: string; color?: string }[];
  members?: { user?: { name?: string } }[];
}

export interface SearchTask extends TaskSummary {
  section?: {
    name?: string;
    project?: { name?: string; slug?: string };
  };
}

export interface SearchResults {
  projects?: ProjectSummary[];
  tasks?: SearchTask[];
}

export interface CommentResult {
  id: string;
  content: string;
  author?: { name?: string };
}

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
  position?: number;
}

export interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  author?: { id?: string; name?: string; avatar?: string };
}

export interface MemberItem {
  id: string;
  role: string;
  accessType: string;
  user: { id: string; name: string; email: string; avatar?: string };
}

export interface TagItem {
  id: string;
  name: string;
  color: string;
}

export interface AttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url?: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  actorName?: string;
  details?: unknown;
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  section?: {
    id: string;
    name: string;
    color?: string;
    project?: { id: string; name: string; slug: string };
  };
  tags?: { tag?: TagItem }[];
  assignees?: { user?: { id: string; name: string; email: string; avatar?: string } }[];
  subtasks?: SubtaskItem[];
  comments?: CommentItem[];
  blockedBy?: { dependsOn?: { id: string; title: string; status: TaskStatus } }[];
  blocks?: { task?: { id: string; title: string; status: TaskStatus } }[];
  attachments?: AttachmentItem[];
}

export interface MyTask extends TaskSummary {
  section?: {
    id: string;
    name: string;
    project?: { id: string; name: string; slug: string };
  };
  tags?: { tag?: TagItem }[];
  subtasks?: SubtaskItem[];
}

export interface AssigneeItem {
  id: string;
  accessType: string;
  user: { id: string; name: string; email: string };
}
