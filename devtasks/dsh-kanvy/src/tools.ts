import { defineTool } from '@deepseek-ai/dsh-tools';
import type { KanvyClient } from './core/client.js';
import {
  formatProjectLine,
  formatProjectMarkdown,
  formatSearchResults,
  formatTaskLine,
} from './core/format.js';
import type { TaskStatus } from './core/types.js';

export interface KanvyToolOptions {
  allowWrites: boolean;
  timeoutMs?: number;
}

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;

const TEXT_OUTPUT = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      text: { type: 'string' as const, required: true as const },
    },
  },
  render: (_args: unknown, value: { text: string }) => [{ type: 'text' as const, text: value.text }],
};

function clampLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), 100);
}

function checkDate(value: string | undefined, field: string): void {
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD`);
  }
}

export function createKanvyTools(client: KanvyClient, options: KanvyToolOptions) {
  const timeoutMs = options.timeoutMs ?? 30000;

  const assertWrites = (): void => {
    if (!options.allowWrites) {
      throw new Error('Kanvy writes are disabled. Set allowWrites: true in the dsh-kanvy plugin config.');
    }
  };

  return [
    defineTool({
      name: 'kanvy_list_projects',
      description:
        'List the Kanvy projects the authenticated user can access, with section and member counts. '
        + 'Start here to discover project slugs.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute() {
        const projects = await client.listProjects();
        const text = projects.length === 0
          ? 'No projects found for the authenticated Kanvy user.'
          : [`# Kanvy projects (${projects.length})`, '', ...projects.map(formatProjectLine)].join('\n');
        return { text };
      },
    }),

    defineTool({
      name: 'kanvy_get_project',
      description:
        'Get one Kanvy project by slug, including its sections, task counts and tags. '
        + 'Use kanvy_list_projects first to find the slug.',
      parameters: {
        slug: { type: 'string', required: true, description: 'Project slug, e.g. "demo-project"' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ slug }) {
        const project = await client.getProject(slug);
        return { text: formatProjectMarkdown(project) };
      },
    }),

    defineTool({
      name: 'kanvy_list_tasks',
      description:
        'List tasks in a Kanvy section with id, status, due date, subtask progress, assignees and tags. '
        + 'Section ids come from kanvy_get_project.',
      parameters: {
        sectionId: { type: 'string', required: true, description: 'Section id' },
        status: {
          type: 'string',
          enum: STATUSES,
          description: 'Optional status filter',
        },
        archived: { type: 'boolean', description: 'Include archived tasks (default false)' },
        limit: { type: 'integer', description: 'Max tasks to return (1-100, default 25)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ sectionId, status, archived, limit }) {
        const tasks = await client.listTasks(sectionId, {
          status: status as TaskStatus | undefined,
          archived,
        });
        if (tasks.length === 0) return { text: 'No tasks found for this section.' };
        const pageSize = clampLimit(limit, 25);
        const page = tasks.slice(0, pageSize);
        const text = [
          `# Tasks in section \`${sectionId}\` (${page.length}/${tasks.length})`,
          '',
          ...page.map(formatTaskLine),
        ].join('\n');
        return { text };
      },
    }),

    defineTool({
      name: 'kanvy_search',
      description: 'Search Kanvy projects and tasks by text (minimum 2 characters).',
      parameters: {
        query: { type: 'string', required: true, description: 'Search text' },
        limit: { type: 'integer', description: 'Max results per group (1-100, default 10)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ query, limit }) {
        if (query.trim().length < 2) throw new Error('query must have at least 2 characters');
        const pageSize = clampLimit(limit, 10);
        const results = await client.search(query.trim());
        return {
          text: formatSearchResults({
            projects: (results.projects ?? []).slice(0, pageSize),
            tasks: (results.tasks ?? []).slice(0, pageSize),
          }),
        };
      },
    }),

    defineTool({
      name: 'kanvy_create_task',
      description:
        'Create a task in a Kanvy section. Returns the new task id and status. '
        + 'Requires allowWrites: true.',
      parameters: {
        sectionId: { type: 'string', required: true, description: 'Section id where the task will be created' },
        title: { type: 'string', required: true, description: 'Task title' },
        description: { type: 'string', description: 'Optional markdown description' },
        status: {
          type: 'string',
          enum: STATUSES,
          description: 'Initial status (default TODO)',
        },
        startDate: { type: 'string', description: 'Optional start date (YYYY-MM-DD)' },
        dueDate: { type: 'string', description: 'Optional due date (YYYY-MM-DD)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ sectionId, title, description, status, startDate, dueDate }) {
        assertWrites();
        checkDate(startDate, 'startDate');
        checkDate(dueDate, 'dueDate');
        const task = await client.createTask(sectionId, {
          title,
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status: status as TaskStatus } : {}),
          ...(startDate !== undefined ? { startDate } : {}),
          ...(dueDate !== undefined ? { dueDate } : {}),
        });
        return { text: `Created task "${task.title}" (\`${task.id}\`) with status ${task.status}.` };
      },
    }),

    defineTool({
      name: 'kanvy_add_comment',
      description:
        'Add a comment to an existing Kanvy task. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        content: { type: 'string', required: true, description: 'Comment text' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, content }) {
        assertWrites();
        const comment = await client.addComment(taskId, content);
        return {
          text: `Comment added to task \`${taskId}\`${comment.author?.name ? ` by ${comment.author.name}` : ''}.`,
        };
      },
    }),
  ];
}
