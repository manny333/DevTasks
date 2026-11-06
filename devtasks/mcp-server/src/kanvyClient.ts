import { truncate } from './format.js';
import type {
  ActivityItem,
  AssigneeItem,
  AttachmentItem,
  CommentItem,
  CommentResult,
  MemberItem,
  MyTask,
  ProjectDetail,
  ProjectSummary,
  SearchResults,
  SubtaskItem,
  TagItem,
  TaskDetail,
  TaskStatus,
  TaskSummary,
} from './types.js';

export interface KanvyClientOptions {
  apiUrl: string;
  token: string;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class KanvyApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'KanvyApiError';
  }
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string;
  startDate?: string;
}

export interface ListTasksOptions {
  status?: TaskStatus;
  archived?: boolean;
}

/** Small typed client for the Kanvy REST API. Never logs or returns the token. */
export class KanvyClient {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KanvyClientOptions) {
    this.apiUrl = options.apiUrl;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      headers.set('Authorization', `Bearer ${this.token}`);
      if (init.body) headers.set('Content-Type', 'application/json');

      const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });

      const text = await response.text();

      if (!response.ok) {
        let detail = text;
        try {
          const parsed = JSON.parse(text) as { error?: unknown };
          if (typeof parsed.error === 'string' && parsed.error.trim()) detail = parsed.error;
        } catch {
          // Not JSON: keep the raw body.
        }
        throw new KanvyApiError(
          response.status,
          `Kanvy API ${response.status}: ${truncate(detail.trim(), 400) || 'request failed'}`
        );
      }

      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      if (error instanceof KanvyApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new KanvyApiError(504, `Kanvy API timed out after ${this.timeoutMs} ms`);
      }
      const reason = error instanceof Error ? error.message : 'unknown network error';
      throw new KanvyApiError(502, `Could not reach Kanvy API: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.request<ProjectSummary[]>('/projects');
  }

  getProject(slug: string): Promise<ProjectDetail> {
    return this.request<ProjectDetail>(`/projects/${encodeURIComponent(slug)}`);
  }

  listTasks(sectionId: string, options: ListTasksOptions = {}): Promise<TaskSummary[]> {
    const params = new URLSearchParams({ archived: String(options.archived ?? false) });
    if (options.status) params.set('status', options.status);
    return this.request<TaskSummary[]>(
      `/sections/${encodeURIComponent(sectionId)}/tasks?${params.toString()}`
    );
  }

  search(query: string): Promise<SearchResults> {
    return this.request<SearchResults>(`/search?q=${encodeURIComponent(query)}`);
  }

  createTask(sectionId: string, input: CreateTaskInput): Promise<TaskSummary> {
    return this.request<TaskSummary>(`/sections/${encodeURIComponent(sectionId)}/tasks`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  addComment(taskId: string, content: string): Promise<CommentResult> {
    return this.request<CommentResult>(`/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  getTask(taskId: string): Promise<TaskDetail> {
    return this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}`);
  }

  updateTask(
    taskId: string,
    input: { title?: string; description?: string; startDate?: string; dueDate?: string }
  ): Promise<TaskDetail> {
    return this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  moveTask(taskId: string, status: TaskStatus, position: number): Promise<TaskDetail> {
    return this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ status, position }),
    });
  }

  archiveTask(taskId: string): Promise<TaskDetail> {
    return this.request<TaskDetail>(`/tasks/${encodeURIComponent(taskId)}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  }

  listSubtasks(taskId: string): Promise<SubtaskItem[]> {
    return this.request<SubtaskItem[]>(`/tasks/${encodeURIComponent(taskId)}/subtasks`);
  }

  createSubtask(taskId: string, title: string): Promise<SubtaskItem> {
    return this.request<SubtaskItem>(`/tasks/${encodeURIComponent(taskId)}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  updateSubtask(
    taskId: string,
    subtaskId: string,
    input: { title?: string; completed?: boolean }
  ): Promise<SubtaskItem> {
    return this.request<SubtaskItem>(
      `/tasks/${encodeURIComponent(taskId)}/subtasks/${encodeURIComponent(subtaskId)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
  }

  listComments(taskId: string, limit = 50): Promise<CommentItem[]> {
    return this.request<CommentItem[]>(
      `/tasks/${encodeURIComponent(taskId)}/comments?limit=${encodeURIComponent(String(limit))}`
    );
  }

  listAssignees(taskId: string): Promise<AssigneeItem[]> {
    return this.request<AssigneeItem[]>(`/tasks/${encodeURIComponent(taskId)}/assignees`);
  }

  assignUser(
    taskId: string,
    email: string,
    accessType: 'FULL' | 'EDITOR' | 'VIEWER' = 'VIEWER'
  ): Promise<AssigneeItem> {
    return this.request<AssigneeItem>(`/tasks/${encodeURIComponent(taskId)}/assignees`, {
      method: 'POST',
      body: JSON.stringify({ email, accessType }),
    });
  }

  listMembers(projectId: string): Promise<MemberItem[]> {
    return this.request<MemberItem[]>(`/projects/${encodeURIComponent(projectId)}/members`);
  }

  addMember(
    projectId: string,
    email: string,
    accessType: 'FULL' | 'EDITOR' | 'VIEWER' = 'FULL'
  ): Promise<MemberItem> {
    return this.request<MemberItem>(`/projects/${encodeURIComponent(projectId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, accessType }),
    });
  }

  listTags(projectId: string): Promise<TagItem[]> {
    return this.request<TagItem[]>(`/projects/${encodeURIComponent(projectId)}/tags`);
  }

  createTag(projectId: string, name: string, color?: string): Promise<TagItem> {
    return this.request<TagItem>(`/projects/${encodeURIComponent(projectId)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name, ...(color ? { color } : {}) }),
    });
  }

  addTag(taskId: string, tagId: string): Promise<void> {
    return this.request<void>(`/tasks/${encodeURIComponent(taskId)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tagId }),
    });
  }

  addDependency(taskId: string, dependsOnId: string): Promise<void> {
    return this.request<void>(`/tasks/${encodeURIComponent(taskId)}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({ dependsOnId }),
    });
  }

  listActivity(taskId: string): Promise<ActivityItem[]> {
    return this.request<ActivityItem[]>(`/tasks/${encodeURIComponent(taskId)}/activity`);
  }

  listAttachments(taskId: string): Promise<AttachmentItem[]> {
    return this.request<AttachmentItem[]>(`/tasks/${encodeURIComponent(taskId)}/attachments`);
  }

  myTasks(status?: TaskStatus, limit = 100): Promise<MyTask[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status) params.set('status', status);
    return this.request<MyTask[]>(`/me/tasks?${params.toString()}`);
  }

  getCalendar(projectId: string, from: string, to: string): Promise<TaskSummary[]> {
    const params = new URLSearchParams({ from, to });
    return this.request<TaskSummary[]>(
      `/projects/${encodeURIComponent(projectId)}/calendar?${params.toString()}`
    );
  }

  createProject(input: {
    name: string;
    description?: string;
    template?: string;
  }): Promise<ProjectSummary> {
    return this.request<ProjectSummary>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  createSection(
    projectId: string,
    input: { name: string; description?: string; color?: string }
  ): Promise<{ id: string; name: string }> {
    return this.request<{ id: string; name: string }>(
      `/projects/${encodeURIComponent(projectId)}/sections`,
      { method: 'POST', body: JSON.stringify(input) }
    );
  }

  getMe(): Promise<{ id: string; name: string; email: string; avatar?: string }> {
    return this.request<{ id: string; name: string; email: string; avatar?: string }>('/auth/me');
  }
}
