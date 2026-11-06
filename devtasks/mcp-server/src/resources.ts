import { ResourceTemplate } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import type { KanvyClient } from './kanvyClient.js';
import {
  formatProjectLine,
  formatProjectMarkdown,
  formatTaskDetail,
  formatTaskLine,
} from './format.js';

function variable(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Exposes the current user, project boards and individual tasks as resources. */
export function registerResources(server: McpServer, client: KanvyClient): void {
  server.registerResource(
    'me',
    'kanvy://me',
    {
      title: 'Current Kanvy user',
      description: 'The user authenticated by the configured Kanvy token.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const user = await client.getMe();
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: `# ${user.name}\n\n- Email: ${user.email}\n- ID: \`${user.id}\``,
        }],
      };
    }
  );

  server.registerResource(
    'projects',
    'kanvy://projects',
    {
      title: 'Kanvy projects',
      description: 'Overview of every project the authenticated user can access.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const projects = await client.listProjects();
      const text =
        projects.length === 0
          ? '# Kanvy projects\n\nNo projects found.'
          : ['# Kanvy projects', '', ...projects.map(formatProjectLine)].join('\n');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    }
  );

  const projectTemplate = new ResourceTemplate('kanvy://projects/{slug}', {
    list: async () => {
      const projects = await client.listProjects();
      return {
        resources: projects.map((project) => ({
          uri: `kanvy://projects/${project.slug}`,
          name: project.slug,
          title: project.name,
          description: project.description ?? undefined,
          mimeType: 'text/markdown',
        })),
      };
    },
  });

  server.registerResource(
    'project',
    projectTemplate,
    {
      title: 'Kanvy project',
      description: 'Markdown summary of a single Kanvy project (sections, task counts and tags).',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = variable(variables.slug);
      if (!slug) throw new Error('Missing project slug in resource URI');
      const project = await client.getProject(slug);
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatProjectMarkdown(project) }],
      };
    }
  );

  const boardTemplate = new ResourceTemplate('kanvy://projects/{slug}/board', {
    list: async () => {
      const projects = await client.listProjects();
      return {
        resources: projects.map((project) => ({
          uri: `kanvy://projects/${project.slug}/board`,
          name: `${project.slug}-board`,
          title: `${project.name} board`,
          description: 'Sections and tasks of the project board.',
          mimeType: 'text/markdown',
        })),
      };
    },
  });

  server.registerResource(
    'project-board',
    boardTemplate,
    {
      title: 'Kanvy project board',
      description: 'Sections and tasks of a project board as compact markdown.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = variable(variables.slug);
      if (!slug) throw new Error('Missing project slug in resource URI');
      const project = await client.getProject(slug);
      const lines = [`# ${project.name}`, '', `- Slug: \`${project.slug}\``];
      for (const section of project.sections ?? []) {
        lines.push('', `## ${section.name}`, '');
        const tasks = section.tasks ?? [];
        if (tasks.length === 0) lines.push('(no tasks)');
        else lines.push(...tasks.map(formatTaskLine));
      }
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: lines.join('\n') }],
      };
    }
  );

  const taskTemplate = new ResourceTemplate('kanvy://tasks/{taskId}', {
    list: undefined,
  });

  server.registerResource(
    'task',
    taskTemplate,
    {
      title: 'Kanvy task',
      description: 'Full markdown detail of a single task.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const taskId = variable(variables.taskId);
      if (!taskId) throw new Error('Missing task id in resource URI');
      const task = await client.getTask(taskId);
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatTaskDetail(task) }],
      };
    }
  );
}
