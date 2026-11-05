import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { formatProjectMarkdown, formatProjectLine, formatSearchResults, formatTaskLine, truncate } from './format.js';
import type { CreateTaskInput, KanvyClient } from './kanvyClient.js';
import type { TaskStatus } from './types.js';

export interface ToolOptions {
  allowWrites: boolean;
  /** Maximum items returned by list/search tools. */
  maxItems?: number;
}

export interface ToolHandlers {
  list_projects: () => Promise<string>;
  get_project: (input: { slug: string }) => Promise<string>;
  list_tasks: (input: {
    sectionId: string;
    status?: TaskStatus;
    archived?: boolean;
    limit?: number;
  }) => Promise<string>;
  search: (input: { query: string; limit?: number }) => Promise<string>;
  create_task: (input: CreateTaskInput & { sectionId: string }) => Promise<string>;
  add_comment: (input: { taskId: string; content: string }) => Promise<string>;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function clampLimit(value: number | undefined, fallback = DEFAULT_LIMIT): number {
  if (value === undefined) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
}

/**
 * Pure handlers, independent from the MCP server. Exported so they can be unit
 * tested without spinning up a transport.
 */
export function createToolHandlers(client: KanvyClient, options: ToolOptions): ToolHandlers {
  const maxItems = clampLimit(options.maxItems, MAX_LIMIT);

  const assertWrites = (): void => {
    if (!options.allowWrites) {
      throw new Error('Writes are disabled. Set KANVY_ALLOW_WRITES=1 to enable create/comment tools.');
    }
  };

  return {
    list_projects: async () => {
      const projects = await client.listProjects();
      if (projects.length === 0) return 'No projects found for the authenticated user.';
      return [`# Kanvy projects (${projects.length})`, '', ...projects.map(formatProjectLine)].join('\n');
    },

    get_project: async ({ slug }) => {
      const project = await client.getProject(slug);
      return formatProjectMarkdown(project);
    },

    list_tasks: async ({ sectionId, status, archived, limit }) => {
      const tasks = await client.listTasks(sectionId, { status, archived });
      if (tasks.length === 0) return 'No tasks found for this section.';
      const pageSize = Math.min(clampLimit(limit), maxItems);
      const page = tasks.slice(0, pageSize);
      const header = `# Tasks in section \`${sectionId}\` (${page.length}/${tasks.length})`;
      return [header, '', ...page.map(formatTaskLine)].join('\n');
    },

    search: async ({ query, limit }) => {
      const pageSize = Math.min(clampLimit(limit, 10), maxItems);
      const results = await client.search(query);
      const trimmed = {
        projects: (results.projects ?? []).slice(0, pageSize),
        tasks: (results.tasks ?? []).slice(0, pageSize),
      };
      return formatSearchResults(trimmed);
    },

    create_task: async ({ sectionId, title, description, status, dueDate, startDate }) => {
      assertWrites();
      const task = await client.createTask(sectionId, {
        title,
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
      });
      return `Created task "${task.title}" (\`${task.id}\`) with status ${task.status}.`;
    },

    add_comment: async ({ taskId, content }) => {
      assertWrites();
      const comment = await client.addComment(taskId, content);
      return `Comment added to task \`${taskId}\`${comment.author?.name ? ` by ${comment.author.name}` : ''}.`;
    },
  };
}

const statusSchema = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional();

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;
const write = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

async function run(fn: () => Promise<string>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: truncate(await fn()) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

/** Registers the Kanvy tools on an MCP server. */
export function registerTools(server: McpServer, handlers: ToolHandlers): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List Kanvy projects',
      description: 'List the projects the authenticated Kanvy user can access, with section/member counts.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => run(() => handlers.list_projects())
  );

  server.registerTool(
    'get_project',
    {
      title: 'Get Kanvy project',
      description:
        'Get a project by slug, including its sections, task counts and tags. Use list_projects first to discover slugs.',
      inputSchema: z.object({
        slug: z.string().min(1).describe('Project slug, e.g. "demo-project"'),
      }),
      annotations: readOnly,
    },
    async ({ slug }) => run(() => handlers.get_project({ slug }))
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List section tasks',
      description:
        'List tasks in a Kanvy section. Returns compact lines with id, status, due date, subtask progress, assignees and tags.',
      inputSchema: z.object({
        sectionId: z.string().min(1).describe('Section id (see get_project output)'),
        status: statusSchema.optional().describe('Filter by status'),
        archived: z.boolean().optional().describe('Include archived tasks (default false)'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Max tasks to return (default 25)'),
      }),
      annotations: readOnly,
    },
    async ({ sectionId, status, archived, limit }) =>
      run(() => handlers.list_tasks({ sectionId, status, archived, limit }))
  );

  server.registerTool(
    'search',
    {
      title: 'Search Kanvy',
      description: 'Search projects and tasks by text (minimum 2 characters).',
      inputSchema: z.object({
        query: z.string().min(2).max(200).describe('Search text'),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe('Max results per group (default 10)'),
      }),
      annotations: readOnly,
    },
    async ({ query, limit }) => run(() => handlers.search({ query, limit }))
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create Kanvy task',
      description:
        'Create a task in a Kanvy section. Requires KANVY_ALLOW_WRITES=1. Returns the new task id and status.',
      inputSchema: z.object({
        sectionId: z.string().min(1).describe('Section id where the task will be created'),
        title: z.string().min(1).max(200).describe('Task title'),
        description: z.string().max(20000).optional().describe('Optional markdown description'),
        status: statusSchema.optional().describe('Initial status (default TODO)'),
        startDate: dateSchema.describe('Optional start date (YYYY-MM-DD)'),
        dueDate: dateSchema.describe('Optional due date (YYYY-MM-DD)'),
      }),
      annotations: write,
    },
    async ({ sectionId, title, description, status, startDate, dueDate }) =>
      run(() =>
        handlers.create_task({ sectionId, title, description, status, startDate, dueDate })
      )
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Comment on Kanvy task',
      description: 'Add a comment to an existing Kanvy task. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        content: z.string().min(1).max(10000).describe('Comment text'),
      }),
      annotations: write,
    },
    async ({ taskId, content }) => run(() => handlers.add_comment({ taskId, content }))
  );
}
