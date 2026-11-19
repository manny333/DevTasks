import { defineTool } from '@deepseek-ai/dsh-tools';
import type { KanvyClient } from './core/client.js';
import {
  formatActivity,
  formatAgenda,
  formatAttachments,
  formatComments,
  formatDocumentPage,
  formatDocuments,
  formatMembers,
  formatMyTasks,
  formatProjectContext,
  formatProjectHealth,
  formatProjectLine,
  formatProjectMarkdown,
  formatSearchResults,
  formatTags,
  formatTaskDetail,
  formatTaskLine,
  truncate,
} from './core/format.js';
import type { DocumentCategory, TaskStatus } from './core/types.js';

export interface KanvyToolOptions {
  allowWrites: boolean;
  timeoutMs?: number;
}

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
const ACCESS_TYPES = ['FULL', 'EDITOR', 'VIEWER'] as const;
const TEMPLATES = ['blank', 'software', 'personal', 'marketing'] as const;
const DOCUMENT_CATEGORIES = ['SPEC', 'REQUIREMENTS', 'ARCHITECTURE', 'DECISION', 'GUIDE', 'RUNBOOK', 'OTHER'] as const;

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

function clampMaxChars(value: number | undefined, fallback = 12000): number {
  if (value === undefined) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1000), 20000);
}

function checkDate(value: string | undefined, field: string): void {
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD`);
  }
}

function checkColor(value: string | undefined): void {
  if (value !== undefined && !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error('color must be a hex value like #6366f1');
  }
}

function checkEmail(value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('email must be a valid address');
  }
}

function text(value: string): { text: string } {
  return { text: truncate(value) };
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
        const value = projects.length === 0
          ? 'No projects found for the authenticated Kanvy user.'
          : [`# Kanvy projects (${projects.length})`, '', ...projects.map(formatProjectLine)].join('\n');
        return text(value);
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
        return text(formatProjectMarkdown(await client.getProject(slug)));
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
        return text([
          `# Tasks in section \`${sectionId}\` (${page.length}/${tasks.length})`,
          '',
          ...page.map(formatTaskLine),
        ].join('\n'));
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
        return text(formatSearchResults({
          projects: (results.projects ?? []).slice(0, pageSize),
          tasks: (results.tasks ?? []).slice(0, pageSize),
        }));
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
        if (!title.trim()) throw new Error('title must not be empty');
        const task = await client.createTask(sectionId, {
          title,
          ...(description !== undefined ? { description } : {}),
          ...(status !== undefined ? { status: status as TaskStatus } : {}),
          ...(startDate !== undefined ? { startDate } : {}),
          ...(dueDate !== undefined ? { dueDate } : {}),
        });
        return text(`Created task "${task.title}" (\`${task.id}\`) with status ${task.status}.`);
      },
    }),

    defineTool({
      name: 'kanvy_add_comment',
      description: 'Add a comment to an existing Kanvy task. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        content: { type: 'string', required: true, description: 'Comment text' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, content }) {
        assertWrites();
        if (!content.trim()) throw new Error('content must not be empty');
        const comment = await client.addComment(taskId, content);
        return text(
          `Comment added to task \`${taskId}\`${comment.author?.name ? ` by ${comment.author.name}` : ''}.`
        );
      },
    }),

    defineTool({
      name: 'kanvy_get_task',
      description:
        'Get full task detail: status, dates, tags, assignees, subtasks, comments, dependencies and attachments.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ taskId }) {
        return text(formatTaskDetail(await client.getTask(taskId)));
      },
    }),

    defineTool({
      name: 'kanvy_update_task',
      description: 'Update a task title, description, start date or due date. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New markdown description' },
        startDate: { type: 'string', description: 'New start date (YYYY-MM-DD)' },
        dueDate: { type: 'string', description: 'New due date (YYYY-MM-DD)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, title, description, startDate, dueDate }) {
        assertWrites();
        checkDate(startDate, 'startDate');
        checkDate(dueDate, 'dueDate');
        if (title === undefined && description === undefined && startDate === undefined && dueDate === undefined) {
          throw new Error('Provide at least one field to update');
        }
        const task = await client.updateTask(taskId, {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(startDate !== undefined ? { startDate } : {}),
          ...(dueDate !== undefined ? { dueDate } : {}),
        });
        return text(`Updated task "${task.title}" (\`${task.id}\`).`);
      },
    }),

    defineTool({
      name: 'kanvy_move_task',
      description: 'Change a task status and append it to the target column. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        status: { type: 'string', required: true, enum: STATUSES, description: 'Target status' },
        position: { type: 'integer', description: 'Zero-based position; default append' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, status, position }) {
        assertWrites();
        const task = await client.getTask(taskId);
        const sectionId = task.section?.id;
        if (!sectionId) throw new Error('Task has no section');
        let targetPosition = position;
        if (targetPosition === undefined) {
          const tasks = await client.listTasks(sectionId, { archived: false });
          targetPosition = tasks.filter(
            (candidate) => candidate.status === status && candidate.id !== taskId
          ).length;
        }
        const updated = await client.moveTask(taskId, status as TaskStatus, targetPosition);
        return text(`Moved "${updated.title}" (\`${updated.id}\`) to ${status} at position ${targetPosition}.`);
      },
    }),

    defineTool({
      name: 'kanvy_archive_task',
      description: 'Archive or unarchive a task. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        archived: { type: 'boolean', description: 'Desired state; default toggles' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, archived }) {
        assertWrites();
        const task = await client.getTask(taskId);
        const desired = archived ?? !task.archived;
        if (task.archived === desired) {
          return text(`Task \`${taskId}\` is already ${desired ? 'archived' : 'active'}.`);
        }
        await client.archiveTask(taskId);
        return text(`Task \`${taskId}\` ${desired ? 'archived' : 'unarchived'}.`);
      },
    }),

    defineTool({
      name: 'kanvy_list_comments',
      description: 'List the comments of a task in chronological order.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        limit: { type: 'integer', description: 'Max comments (1-100, default 50)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ taskId, limit }) {
        return text(formatComments(await client.listComments(taskId, clampLimit(limit, 50))));
      },
    }),

    defineTool({
      name: 'kanvy_add_subtask',
      description: 'Add a checklist item to a task. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        title: { type: 'string', required: true, description: 'Subtask title' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, title }) {
        assertWrites();
        if (!title.trim()) throw new Error('title must not be empty');
        const subtask = await client.createSubtask(taskId, title);
        return text(`Subtask "${subtask.title}" created (\`${subtask.id}\`).`);
      },
    }),

    defineTool({
      name: 'kanvy_update_subtask',
      description: 'Rename a subtask or mark it complete. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        subtaskId: { type: 'string', required: true, description: 'Subtask id' },
        title: { type: 'string', description: 'New subtask title' },
        completed: { type: 'boolean', description: 'Completion state' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, subtaskId, title, completed }) {
        assertWrites();
        if (title === undefined && completed === undefined) {
          throw new Error('Provide title and/or completed');
        }
        const subtask = await client.updateSubtask(taskId, subtaskId, {
          ...(title !== undefined ? { title } : {}),
          ...(completed !== undefined ? { completed } : {}),
        });
        return text(`Subtask "${subtask.title}" updated: ${subtask.completed ? 'completed' : 'pending'}.`);
      },
    }),

    defineTool({
      name: 'kanvy_assign_task',
      description: 'Assign a user by email with FULL, EDITOR or VIEWER access. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        email: { type: 'string', required: true, description: 'User email' },
        accessType: {
          type: 'string',
          enum: ACCESS_TYPES,
          description: 'Task access level (default VIEWER)',
        },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, email, accessType }) {
        assertWrites();
        checkEmail(email);
        const assignee = await client.assignUser(taskId, email, accessType ?? 'VIEWER');
        return text(
          `Assigned ${assignee.user.name} <${assignee.user.email}> to task \`${taskId}\` with ${assignee.accessType} access.`
        );
      },
    }),

    defineTool({
      name: 'kanvy_list_tags',
      description: 'List tags of a project with their ids, names and colors.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug }) {
        const project = await client.getProject(projectSlug);
        return text(formatTags(await client.listTags(project.id)));
      },
    }),

    defineTool({
      name: 'kanvy_create_tag',
      description: 'Create a project tag. Requires allowWrites: true.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        name: { type: 'string', required: true, description: 'Tag name' },
        color: { type: 'string', description: 'Hex color like #6366f1' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ projectSlug, name, color }) {
        assertWrites();
        checkColor(color);
        const project = await client.getProject(projectSlug);
        const tag = await client.createTag(project.id, name, color);
        return text(`Tag "${tag.name}" created (\`${tag.id}\`).`);
      },
    }),

    defineTool({
      name: 'kanvy_add_tag',
      description: 'Apply an existing tag to a task. Use kanvy_list_tags to obtain tag ids. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
        tagId: { type: 'string', required: true, description: 'Tag id' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, tagId }) {
        assertWrites();
        await client.addTag(taskId, tagId);
        return text(`Tag \`${tagId}\` added to task \`${taskId}\`.`);
      },
    }),

    defineTool({
      name: 'kanvy_add_dependency',
      description: 'Make one task depend on another. Requires allowWrites: true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Blocked task id' },
        dependsOnId: { type: 'string', required: true, description: 'Task that must finish first' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ taskId, dependsOnId }) {
        assertWrites();
        await client.addDependency(taskId, dependsOnId);
        return text(`Task \`${taskId}\` now depends on \`${dependsOnId}\`.`);
      },
    }),

    defineTool({
      name: 'kanvy_list_members',
      description: 'List project members with their role and access type.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug }) {
        const project = await client.getProject(projectSlug);
        return text(formatMembers(await client.listMembers(project.id)));
      },
    }),

    defineTool({
      name: 'kanvy_add_member',
      description: 'Add an existing Kanvy user to a project by email. Requires allowWrites: true.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        email: { type: 'string', required: true, description: 'User email' },
        accessType: {
          type: 'string',
          enum: ACCESS_TYPES,
          description: 'Project access level (default FULL)',
        },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ projectSlug, email, accessType }) {
        assertWrites();
        checkEmail(email);
        const project = await client.getProject(projectSlug);
        const member = await client.addMember(project.id, email, accessType ?? 'FULL');
        return text(`Member ${member.user.name} <${member.user.email}> added with ${member.accessType} access.`);
      },
    }),

    defineTool({
      name: 'kanvy_list_activity',
      description: 'List the activity log of a task (last 50 events).',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ taskId }) {
        return text(formatActivity(await client.listActivity(taskId)));
      },
    }),

    defineTool({
      name: 'kanvy_list_attachments',
      description: 'List a task attachments and their signed download URLs.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ taskId }) {
        return text(formatAttachments(await client.listAttachments(taskId)));
      },
    }),

    defineTool({
      name: 'kanvy_my_tasks',
      description: 'List the tasks assigned to the authenticated user, with project and section context.',
      parameters: {
        status: { type: 'string', enum: STATUSES, description: 'Optional status filter' },
        limit: { type: 'integer', description: 'Max tasks (1-100, default 50)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ status, limit }) {
        return text(formatMyTasks(
          await client.myTasks(status as TaskStatus | undefined, clampLimit(limit, 50))
        ));
      },
    }),

    defineTool({
      name: 'kanvy_project_health',
      description: 'Summarize project completion, overdue, due-soon, unassigned and blocked tasks.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug }) {
        const project = await client.getProject(projectSlug);
        const tasks = (project.sections ?? [])
          .flatMap((section) => section.tasks ?? [])
          .filter((task) => !task.archived);
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

        return text(formatProjectHealth(project, {
          total: tasks.length,
          done,
          overdue,
          dueSoon,
          unassigned,
          blocked,
        }));
      },
    }),

    defineTool({
      name: 'kanvy_agenda',
      description: 'List tasks due in a date range for a project.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        from: { type: 'string', required: true, description: 'Start date (YYYY-MM-DD)' },
        to: { type: 'string', required: true, description: 'End date (YYYY-MM-DD)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug, from, to }) {
        checkDate(from, 'from');
        checkDate(to, 'to');
        if (from > to) throw new Error('from must be before or equal to to');
        const project = await client.getProject(projectSlug);
        return text(formatAgenda(await client.getCalendar(project.id, from, to)));
      },
    }),

    defineTool({
      name: 'kanvy_create_project',
      description: 'Create a project. Requires allowWrites: true.',
      parameters: {
        name: { type: 'string', required: true, description: 'Project name' },
        description: { type: 'string', description: 'Optional description' },
        template: { type: 'string', enum: TEMPLATES, description: 'Optional template' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ name, description, template }) {
        assertWrites();
        if (!name.trim()) throw new Error('name must not be empty');
        const project = await client.createProject({
          name,
          ...(description !== undefined ? { description } : {}),
          ...(template !== undefined ? { template } : {}),
        });
        return text(`Project "${project.name}" created with slug \`${project.slug}\`.`);
      },
    }),

    defineTool({
      name: 'kanvy_create_section',
      description: 'Create a section in a project. Requires allowWrites: true.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        name: { type: 'string', required: true, description: 'Section name' },
        description: { type: 'string', description: 'Optional description' },
        color: { type: 'string', description: 'Hex color like #6366f1' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ projectSlug, name, description, color }) {
        assertWrites();
        checkColor(color);
        if (!name.trim()) throw new Error('name must not be empty');
        const project = await client.getProject(projectSlug);
        const section = await client.createSection(project.id, {
          name,
          ...(description !== undefined ? { description } : {}),
          ...(color !== undefined ? { color } : {}),
        });
        return text(`Section "${section.name}" created (\`${section.id}\`) in project \`${projectSlug}\`.`);
      },
    }),

    defineTool({
      name: 'kanvy_bulk_create_tasks',
      description: 'Create up to 25 tasks in one section. Use dryRun to preview. Requires allowWrites: true.',
      parameters: {
        sectionId: { type: 'string', required: true, description: 'Section id' },
        tasks: {
          type: 'array',
          required: true,
          description: 'Tasks to create (1-25)',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', required: true, description: 'Task title' },
              description: { type: 'string', description: 'Optional markdown description' },
              status: { type: 'string', enum: STATUSES, description: 'Initial status' },
              startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
              dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
            },
          },
        },
        dryRun: { type: 'boolean', description: 'Preview without writing' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => false,
      async execute({ sectionId, tasks, dryRun }) {
        assertWrites();
        if (tasks.length === 0) throw new Error('At least one task is required');
        if (tasks.length > 25) throw new Error('A bulk import is limited to 25 tasks');
        for (const task of tasks) {
          if (!task.title.trim()) throw new Error('Every task needs a title');
          checkDate(task.startDate, 'startDate');
          checkDate(task.dueDate, 'dueDate');
        }

        if (dryRun) {
          return text([
            `Dry run: ${tasks.length} task(s) would be created in section \`${sectionId}\`.`,
            ...tasks.map((task, index) => `${index + 1}. ${task.title}`),
          ].join('\n'));
        }

        const created: string[] = [];
        for (const task of tasks) {
          const result = await client.createTask(sectionId, {
            title: task.title,
            ...(task.description !== undefined ? { description: task.description } : {}),
            ...(task.status !== undefined ? { status: task.status as TaskStatus } : {}),
            ...(task.startDate !== undefined ? { startDate: task.startDate } : {}),
            ...(task.dueDate !== undefined ? { dueDate: task.dueDate } : {}),
          });
          created.push(`${result.title} (\`${result.id}\`)`);
        }

        return text(`Created ${created.length} task(s) in section \`${sectionId}\`:\n${created.map((line) => `- ${line}`).join('\n')}`);
      },
    }),

    defineTool({
      name: 'kanvy_whoami',
      description: 'Show the Kanvy user authenticated by the configured token.',
      parameters: {},
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute() {
        const user = await client.getMe();
        return text(`# Kanvy user\n\n- ${user.name} <${user.email}>\n- ID: \`${user.id}\``);
      },
    }),

    defineTool({
      name: 'kanvy_list_documents',
      description:
        'List project Markdown documents with title, slug, category, author, excerpt and size. '
        + 'Use kanvy_get_document to read the content.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        query: { type: 'string', description: 'Search title and content' },
        category: { type: 'string', enum: DOCUMENT_CATEGORIES, description: 'Optional category filter' },
        pinned: { type: 'boolean', description: 'Only pinned documents' },
        includeArchived: { type: 'boolean', description: 'Include archived documents' },
        limit: { type: 'integer', description: 'Max documents (1-100, default 50)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug, query, category, pinned, includeArchived, limit }) {
        const project = await client.getProject(projectSlug);
        const documents = await client.listDocuments(project.id, {
          ...(query ? { query } : {}),
          ...(category ? { category } : {}),
          ...(pinned !== undefined ? { pinned } : {}),
          ...(includeArchived !== undefined ? { includeArchived } : {}),
          limit: clampLimit(limit, 50),
        });
        return text(formatDocuments(documents));
      },
    }),

    defineTool({
      name: 'kanvy_get_document',
      description:
        'Read a Markdown project document by id or slug. Supports offset and maxChars for long documents.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        documentId: { type: 'string', required: true, description: 'Document id or slug' },
        offset: { type: 'integer', description: 'Start character offset (default 0)' },
        maxChars: { type: 'integer', description: 'Max characters (1000-20000, default 12000)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug, documentId, offset, maxChars }) {
        const project = await client.getProject(projectSlug);
        const documents = await client.listDocuments(project.id, { includeArchived: true, limit: 100 });
        const match = documents.find((document) => document.id === documentId || document.slug === documentId);
        if (!match) throw new Error(`Document not found: ${documentId}`);
        const document = await client.getDocument(project.id, match.id);
        return text(formatDocumentPage(document, Math.max(offset ?? 0, 0), clampMaxChars(maxChars)));
      },
    }),

    defineTool({
      name: 'kanvy_search_documents',
      description: 'Search project Markdown documents and return matching excerpts.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
        query: { type: 'string', required: true, description: 'Search text (minimum 2 characters)' },
        limit: { type: 'integer', description: 'Max results (1-100, default 10)' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug, query, limit }) {
        if (query.trim().length < 2) throw new Error('query must have at least 2 characters');
        const project = await client.getProject(projectSlug);
        const documents = await client.listDocuments(project.id, {
          query: query.trim(),
          limit: clampLimit(limit, 10),
        });
        return text(formatDocuments(documents));
      },
    }),

    defineTool({
      name: 'kanvy_get_project_context',
      description:
        'Get the project description and its pinned documents as a compact context pack for agents.',
      parameters: {
        projectSlug: { type: 'string', required: true, description: 'Project slug' },
      },
      output: TEXT_OUTPUT,
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute({ projectSlug }) {
        const project = await client.getProject(projectSlug);
        return text(formatProjectContext(await client.getProjectContext(project.id)));
      },
    }),
  ];
}
