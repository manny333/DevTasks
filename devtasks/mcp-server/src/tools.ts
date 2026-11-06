import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import {
  formatActivity,
  formatAgenda,
  formatAttachments,
  formatComments,
  formatMembers,
  formatMyTasks,
  formatProjectHealth,
  formatProjectLine,
  formatProjectMarkdown,
  formatSearchResults,
  formatSubtasks,
  formatTags,
  formatTaskDetail,
  formatTaskLine,
  truncate,
} from './format.js';
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
  get_task: (input: { taskId: string }) => Promise<string>;
  update_task: (input: {
    taskId: string;
    title?: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
  }) => Promise<string>;
  move_task: (input: { taskId: string; status: TaskStatus; position?: number }) => Promise<string>;
  archive_task: (input: { taskId: string; archived?: boolean }) => Promise<string>;
  list_comments: (input: { taskId: string; limit?: number }) => Promise<string>;
  add_subtask: (input: { taskId: string; title: string }) => Promise<string>;
  update_subtask: (input: {
    taskId: string;
    subtaskId: string;
    title?: string;
    completed?: boolean;
  }) => Promise<string>;
  assign_task: (input: {
    taskId: string;
    email: string;
    accessType?: 'FULL' | 'EDITOR' | 'VIEWER';
  }) => Promise<string>;
  list_tags: (input: { projectSlug: string }) => Promise<string>;
  create_tag: (input: { projectSlug: string; name: string; color?: string }) => Promise<string>;
  add_tag: (input: { taskId: string; tagId: string }) => Promise<string>;
  add_dependency: (input: { taskId: string; dependsOnId: string }) => Promise<string>;
  list_members: (input: { projectSlug: string }) => Promise<string>;
  add_member: (input: {
    projectSlug: string;
    email: string;
    accessType?: 'FULL' | 'EDITOR' | 'VIEWER';
  }) => Promise<string>;
  list_activity: (input: { taskId: string }) => Promise<string>;
  list_attachments: (input: { taskId: string }) => Promise<string>;
  my_tasks: (input: { status?: TaskStatus; limit?: number }) => Promise<string>;
  project_health: (input: { projectSlug: string }) => Promise<string>;
  agenda: (input: { projectSlug: string; from: string; to: string }) => Promise<string>;
  create_project: (input: { name: string; description?: string; template?: string }) => Promise<string>;
  create_section: (input: {
    projectSlug: string;
    name: string;
    description?: string;
    color?: string;
  }) => Promise<string>;
  bulk_create_tasks: (input: {
    sectionId: string;
    tasks: { title: string; description?: string; status?: TaskStatus; dueDate?: string; startDate?: string }[];
    dryRun?: boolean;
  }) => Promise<string>;
  whoami: () => Promise<string>;
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

    get_task: async ({ taskId }) => formatTaskDetail(await client.getTask(taskId)),

    update_task: async ({ taskId, title, description, startDate, dueDate }) => {
      assertWrites();
      const task = await client.updateTask(taskId, {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
      });
      return `Updated task "${task.title}" (\`${task.id}\`).`;
    },

    move_task: async ({ taskId, status, position }) => {
      assertWrites();
      const task = await client.getTask(taskId);
      const sectionId = task.section?.id;
      if (!sectionId) throw new Error('Task has no section');
      let targetPosition = position;
      if (targetPosition === undefined) {
        const tasks = await client.listTasks(sectionId, { archived: false });
        targetPosition = tasks.filter((candidate) => candidate.status === status && candidate.id !== taskId).length;
      }
      const updated = await client.moveTask(taskId, status, targetPosition);
      return `Moved "${updated.title}" (\`${updated.id}\`) to ${status} at position ${targetPosition}.`;
    },

    archive_task: async ({ taskId, archived }) => {
      assertWrites();
      const task = await client.getTask(taskId);
      const desired = archived ?? !task.archived;
      if (task.archived === desired) {
        return `Task \`${taskId}\` is already ${desired ? 'archived' : 'active'}.`;
      }
      await client.archiveTask(taskId);
      return `Task \`${taskId}\` ${desired ? 'archived' : 'unarchived'}.`;
    },

    list_comments: async ({ taskId, limit }) =>
      formatComments(await client.listComments(taskId, clampLimit(limit, 50))),

    add_subtask: async ({ taskId, title }) => {
      assertWrites();
      const subtask = await client.createSubtask(taskId, title);
      return `Subtask "${subtask.title}" created (\`${subtask.id}\`).`;
    },

    update_subtask: async ({ taskId, subtaskId, title, completed }) => {
      assertWrites();
      if (title === undefined && completed === undefined) {
        throw new Error('Provide title and/or completed');
      }
      const subtask = await client.updateSubtask(taskId, subtaskId, {
        ...(title !== undefined ? { title } : {}),
        ...(completed !== undefined ? { completed } : {}),
      });
      return `Subtask "${subtask.title}" updated: ${subtask.completed ? 'completed' : 'pending'}.`;
    },

    assign_task: async ({ taskId, email, accessType }) => {
      assertWrites();
      const assignee = await client.assignUser(taskId, email, accessType ?? 'VIEWER');
      return `Assigned ${assignee.user.name} <${assignee.user.email}> to task \`${taskId}\` with ${assignee.accessType} access.`;
    },

    list_tags: async ({ projectSlug }) => {
      const project = await client.getProject(projectSlug);
      return formatTags(await client.listTags(project.id));
    },

    create_tag: async ({ projectSlug, name, color }) => {
      assertWrites();
      const project = await client.getProject(projectSlug);
      const tag = await client.createTag(project.id, name, color);
      return `Tag "${tag.name}" created (\`${tag.id}\`).`;
    },

    add_tag: async ({ taskId, tagId }) => {
      assertWrites();
      await client.addTag(taskId, tagId);
      return `Tag \`${tagId}\` added to task \`${taskId}\`.`;
    },

    add_dependency: async ({ taskId, dependsOnId }) => {
      assertWrites();
      await client.addDependency(taskId, dependsOnId);
      return `Task \`${taskId}\` now depends on \`${dependsOnId}\`.`;
    },

    list_members: async ({ projectSlug }) => {
      const project = await client.getProject(projectSlug);
      return formatMembers(await client.listMembers(project.id));
    },

    add_member: async ({ projectSlug, email, accessType }) => {
      assertWrites();
      const project = await client.getProject(projectSlug);
      const member = await client.addMember(project.id, email, accessType ?? 'FULL');
      return `Member ${member.user.name} <${member.user.email}> added with ${member.accessType} access.`;
    },

    list_activity: async ({ taskId }) => formatActivity(await client.listActivity(taskId)),

    list_attachments: async ({ taskId }) => formatAttachments(await client.listAttachments(taskId)),

    my_tasks: async ({ status, limit }) =>
      formatMyTasks(await client.myTasks(status, clampLimit(limit, 50))),

    project_health: async ({ projectSlug }) => {
      const project = await client.getProject(projectSlug);
      const tasks = (project.sections ?? []).flatMap((section) => section.tasks ?? []).filter((task) => !task.archived);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inSevenDays = new Date(today);
      inSevenDays.setDate(inSevenDays.getDate() + 7);

      let done = 0;
      let overdue = 0;
      let dueSoon = 0;
      let unassigned = 0;
      let blocked = 0;

      for (const task of tasks) {
        if (task.status === 'DONE') done++;
        if (task.dueDate && task.status !== 'DONE') {
          const due = new Date(task.dueDate);
          if (due < today) overdue++;
          else if (due <= inSevenDays) dueSoon++;
        }
        if (!task.assignees?.length) unassigned++;
        if (task.blockedBy?.some((dependency) => dependency.dependsOn?.status !== 'DONE')) blocked++;
      }

      return formatProjectHealth(project, {
        total: tasks.length,
        done,
        overdue,
        dueSoon,
        unassigned,
        blocked,
      });
    },

    agenda: async ({ projectSlug, from, to }) => {
      const project = await client.getProject(projectSlug);
      return formatAgenda(await client.getCalendar(project.id, from, to));
    },

    create_project: async ({ name, description, template }) => {
      assertWrites();
      const project = await client.createProject({
        name,
        ...(description !== undefined ? { description } : {}),
        ...(template !== undefined ? { template } : {}),
      });
      return `Project "${project.name}" created with slug \`${project.slug}\`.`;
    },

    create_section: async ({ projectSlug, name, description, color }) => {
      assertWrites();
      const project = await client.getProject(projectSlug);
      const section = await client.createSection(project.id, {
        name,
        ...(description !== undefined ? { description } : {}),
        ...(color !== undefined ? { color } : {}),
      });
      return `Section "${section.name}" created (\`${section.id}\`) in project \`${projectSlug}\`.`;
    },

    bulk_create_tasks: async ({ sectionId, tasks, dryRun }) => {
      assertWrites();
      if (tasks.length === 0) throw new Error('At least one task is required');
      if (tasks.length > 25) throw new Error('A bulk import is limited to 25 tasks');
      for (const task of tasks) {
        if (!task.title.trim()) throw new Error('Every task needs a title');
      }

      if (dryRun) {
        return [
          `Dry run: ${tasks.length} task(s) would be created in section \`${sectionId}\`.`,
          ...tasks.map((task, index) => `${index + 1}. ${task.title}`),
        ].join('\n');
      }

      const created: string[] = [];
      for (const task of tasks) {
        const result = await client.createTask(sectionId, {
          title: task.title,
          ...(task.description !== undefined ? { description: task.description } : {}),
          ...(task.status !== undefined ? { status: task.status } : {}),
          ...(task.startDate !== undefined ? { startDate: task.startDate } : {}),
          ...(task.dueDate !== undefined ? { dueDate: task.dueDate } : {}),
        });
        created.push(`${result.title} (\`${result.id}\`)`);
      }

      return `Created ${created.length} task(s) in section \`${sectionId}\`:\n${created.map((line) => `- ${line}`).join('\n')}`;
    },

    whoami: async () => {
      const user = await client.getMe();
      return `# Kanvy user\n\n- ${user.name} <${user.email}>\n- ID: \`${user.id}\``;
    },
  };
}

const statusSchema = z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional();
const requiredDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .describe('Date in YYYY-MM-DD');
const accessTypeSchema = z.enum(['FULL', 'EDITOR', 'VIEWER']);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #6366f1');

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

  server.registerTool(
    'get_task',
    {
      title: 'Get Kanvy task',
      description: 'Get full task detail: status, dates, tags, assignees, subtasks, comments, dependencies and attachments.',
      inputSchema: z.object({ taskId: z.string().min(1).describe('Task id') }),
      annotations: readOnly,
    },
    async ({ taskId }) => run(() => handlers.get_task({ taskId }))
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update Kanvy task',
      description: 'Update a task title, description, start date or due date. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(20000).optional(),
        startDate: dateSchema,
        dueDate: dateSchema,
      }),
      annotations: write,
    },
    async ({ taskId, title, description, startDate, dueDate }) =>
      run(() => handlers.update_task({ taskId, title, description, startDate, dueDate }))
  );

  server.registerTool(
    'move_task',
    {
      title: 'Move Kanvy task',
      description: 'Change a task status and append it to the target column. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        status: statusSchema.describe('Target status'),
        position: z.number().int().min(0).optional().describe('Zero-based position; default append'),
      }),
      annotations: write,
    },
    async ({ taskId, status, position }) => run(() => handlers.move_task({ taskId, status, position }))
  );

  server.registerTool(
    'archive_task',
    {
      title: 'Archive Kanvy task',
      description: 'Archive or unarchive a task. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        archived: z.boolean().optional().describe('Desired state; default toggles'),
      }),
      annotations: { ...write, destructiveHint: true },
    },
    async ({ taskId, archived }) => run(() => handlers.archive_task({ taskId, archived }))
  );

  server.registerTool(
    'list_comments',
    {
      title: 'List task comments',
      description: 'List the comments of a task in chronological order.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: readOnly,
    },
    async ({ taskId, limit }) => run(() => handlers.list_comments({ taskId, limit }))
  );

  server.registerTool(
    'add_subtask',
    {
      title: 'Add Kanvy subtask',
      description: 'Add a checklist item to a task. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        title: z.string().min(1).max(300).describe('Subtask title'),
      }),
      annotations: write,
    },
    async ({ taskId, title }) => run(() => handlers.add_subtask({ taskId, title }))
  );

  server.registerTool(
    'update_subtask',
    {
      title: 'Update Kanvy subtask',
      description: 'Rename a subtask or mark it complete. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        subtaskId: z.string().min(1).describe('Subtask id'),
        title: z.string().min(1).max(300).optional(),
        completed: z.boolean().optional(),
      }),
      annotations: write,
    },
    async ({ taskId, subtaskId, title, completed }) =>
      run(() => handlers.update_subtask({ taskId, subtaskId, title, completed }))
  );

  server.registerTool(
    'assign_task',
    {
      title: 'Assign Kanvy task',
      description: 'Assign a user by email with FULL, EDITOR or VIEWER access. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        email: z.string().email().describe('User email'),
        accessType: accessTypeSchema.optional().describe('Task access level (default VIEWER)'),
      }),
      annotations: write,
    },
    async ({ taskId, email, accessType }) => run(() => handlers.assign_task({ taskId, email, accessType }))
  );

  server.registerTool(
    'list_tags',
    {
      title: 'List project tags',
      description: 'List tags of a project with their ids, names and colors.',
      inputSchema: z.object({ projectSlug: z.string().min(1).describe('Project slug') }),
      annotations: readOnly,
    },
    async ({ projectSlug }) => run(() => handlers.list_tags({ projectSlug }))
  );

  server.registerTool(
    'create_tag',
    {
      title: 'Create Kanvy tag',
      description: 'Create a project tag. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
        name: z.string().min(1).max(50).describe('Tag name'),
        color: colorSchema.optional(),
      }),
      annotations: write,
    },
    async ({ projectSlug, name, color }) => run(() => handlers.create_tag({ projectSlug, name, color }))
  );

  server.registerTool(
    'add_tag',
    {
      title: 'Tag a Kanvy task',
      description: 'Apply an existing tag to a task. Use list_tags to obtain tag ids. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Task id'),
        tagId: z.string().min(1).describe('Tag id'),
      }),
      annotations: write,
    },
    async ({ taskId, tagId }) => run(() => handlers.add_tag({ taskId, tagId }))
  );

  server.registerTool(
    'add_dependency',
    {
      title: 'Add task dependency',
      description: 'Make one task depend on another. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('Blocked task id'),
        dependsOnId: z.string().min(1).describe('Task that must finish first'),
      }),
      annotations: write,
    },
    async ({ taskId, dependsOnId }) => run(() => handlers.add_dependency({ taskId, dependsOnId }))
  );

  server.registerTool(
    'list_members',
    {
      title: 'List project members',
      description: 'List project members with their role and access type.',
      inputSchema: z.object({ projectSlug: z.string().min(1).describe('Project slug') }),
      annotations: readOnly,
    },
    async ({ projectSlug }) => run(() => handlers.list_members({ projectSlug }))
  );

  server.registerTool(
    'add_member',
    {
      title: 'Add project member',
      description: 'Add an existing Kanvy user to a project by email. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
        email: z.string().email().describe('User email'),
        accessType: accessTypeSchema.optional().describe('Project access level (default FULL)'),
      }),
      annotations: write,
    },
    async ({ projectSlug, email, accessType }) =>
      run(() => handlers.add_member({ projectSlug, email, accessType }))
  );

  server.registerTool(
    'list_activity',
    {
      title: 'List task activity',
      description: 'List the activity log of a task (last 50 events).',
      inputSchema: z.object({ taskId: z.string().min(1).describe('Task id') }),
      annotations: readOnly,
    },
    async ({ taskId }) => run(() => handlers.list_activity({ taskId }))
  );

  server.registerTool(
    'list_attachments',
    {
      title: 'List task attachments',
      description: 'List a task attachments and their signed download URLs.',
      inputSchema: z.object({ taskId: z.string().min(1).describe('Task id') }),
      annotations: readOnly,
    },
    async ({ taskId }) => run(() => handlers.list_attachments({ taskId }))
  );

  server.registerTool(
    'my_tasks',
    {
      title: 'List my Kanvy tasks',
      description: 'List the tasks assigned to the authenticated user, with project and section context.',
      inputSchema: z.object({
        status: statusSchema.optional().describe('Filter by status'),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: readOnly,
    },
    async ({ status, limit }) => run(() => handlers.my_tasks({ status, limit }))
  );

  server.registerTool(
    'project_health',
    {
      title: 'Kanvy project health',
      description: 'Summarize project completion, overdue, due-soon, unassigned and blocked tasks.',
      inputSchema: z.object({ projectSlug: z.string().min(1).describe('Project slug') }),
      annotations: readOnly,
    },
    async ({ projectSlug }) => run(() => handlers.project_health({ projectSlug }))
  );

  server.registerTool(
    'agenda',
    {
      title: 'Kanvy agenda',
      description: 'List tasks due in a date range for a project.',
      inputSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
        from: requiredDateSchema.describe('Start date (YYYY-MM-DD)'),
        to: requiredDateSchema.describe('End date (YYYY-MM-DD)'),
      }),
      annotations: readOnly,
    },
    async ({ projectSlug, from, to }) => run(() => handlers.agenda({ projectSlug, from, to }))
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create Kanvy project',
      description: 'Create a project. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        name: z.string().min(1).max(120).describe('Project name'),
        description: z.string().max(2000).optional(),
        template: z.enum(['blank', 'software', 'personal', 'marketing']).optional(),
      }),
      annotations: write,
    },
    async ({ name, description, template }) =>
      run(() => handlers.create_project({ name, description, template }))
  );

  server.registerTool(
    'create_section',
    {
      title: 'Create Kanvy section',
      description: 'Create a section in a project. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
        name: z.string().min(1).max(80).describe('Section name'),
        description: z.string().max(500).optional(),
        color: colorSchema.optional(),
      }),
      annotations: write,
    },
    async ({ projectSlug, name, description, color }) =>
      run(() => handlers.create_section({ projectSlug, name, description, color }))
  );

  server.registerTool(
    'bulk_create_tasks',
    {
      title: 'Bulk create Kanvy tasks',
      description: 'Create up to 25 tasks in one section. Use dryRun to preview. Requires KANVY_ALLOW_WRITES=1.',
      inputSchema: z.object({
        sectionId: z.string().min(1).describe('Section id'),
        tasks: z.array(z.object({
          title: z.string().min(1).max(200),
          description: z.string().max(20000).optional(),
          status: statusSchema.optional(),
          startDate: dateSchema,
          dueDate: dateSchema,
        })).min(1).max(25),
        dryRun: z.boolean().optional().describe('Preview without writing'),
      }),
      annotations: write,
    },
    async ({ sectionId, tasks, dryRun }) =>
      run(() => handlers.bulk_create_tasks({ sectionId, tasks, dryRun }))
  );

  server.registerTool(
    'whoami',
    {
      title: 'Kanvy current user',
      description: 'Show the Kanvy user authenticated by the configured token.',
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => run(() => handlers.whoami())
  );
}
