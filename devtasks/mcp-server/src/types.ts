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
