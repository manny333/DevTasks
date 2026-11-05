import { truncate } from './format.js';
import type {
  CommentResult,
  ProjectDetail,
  ProjectSummary,
  SearchResults,
  TaskStatus,
  TaskSummary,
} from './types.js';

export interface KanvyClientOptions {
  apiUrl: string;
  /** Static token or a provider read on every request (supports rotation). */
  token: string | (() => string);
  timeoutMs?: number;
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

/** Typed Kanvy REST client. Never logs or returns the token. */
export class KanvyClient {
  private readonly apiUrl: string;
  private readonly token: string | (() => string);
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: KanvyClientOptions) {
    this.apiUrl = options.apiUrl;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private authToken(): string {
    return typeof this.token === 'function' ? this.token() : this.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      headers.set('Authorization', `Bearer ${this.authToken()}`);
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
          // Keep the raw body.
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
}
