import { ResourceTemplate } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import type { KanvyClient } from './kanvyClient.js';
import {
  formatDocumentPage,
  formatDocuments,
  formatProjectContext,
  formatProjectLine,
  formatProjectMarkdown,
  formatProjectPassport,
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

  const documentsTemplate = new ResourceTemplate('kanvy://projects/{slug}/documents', {
    list: async () => {
      const projects = await client.listProjects();
      return {
        resources: projects.map((project) => ({
          uri: `kanvy://projects/${project.slug}/documents`,
          name: `${project.slug}-documents`,
          title: `${project.name} documentation`,
          description: 'Markdown documents of the project.',
          mimeType: 'text/markdown',
        })),
      };
    },
  });

  server.registerResource(
    'project-documents',
    documentsTemplate,
    {
      title: 'Kanvy project documentation',
      description: 'Index of Markdown documents in a project.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = variable(variables.slug);
      if (!slug) throw new Error('Missing project slug in resource URI');
      const project = await client.getProject(slug);
      const documents = await client.listDocuments(project.id, { includeArchived: true, limit: 100 });
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatDocuments(documents) }],
      };
    }
  );

  const documentTemplate = new ResourceTemplate('kanvy://projects/{slug}/documents/{documentId}', {
    list: async () => {
      const projects = await client.listProjects();
      const resources = [];
      for (const project of projects) {
        const documents = await client.listDocuments(project.id, { includeArchived: true, limit: 100 });
        for (const document of documents) {
          resources.push({
            uri: `kanvy://projects/${project.slug}/documents/${document.slug}`,
            name: `${project.slug}-${document.slug}`,
            title: document.title,
            description: `${document.category} · ${document.excerpt}`,
            mimeType: 'text/markdown',
          });
        }
      }
      return { resources };
    },
  });

  server.registerResource(
    'project-document',
    documentTemplate,
    {
      title: 'Kanvy project document',
      description: 'Full Markdown content of a project document.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = variable(variables.slug);
      const documentId = variable(variables.documentId);
      if (!slug || !documentId) throw new Error('Missing project or document identifier in resource URI');
      const project = await client.getProject(slug);
      const documents = await client.listDocuments(project.id, { includeArchived: true, limit: 100 });
      const match = documents.find((document) => document.id === documentId || document.slug === documentId);
      if (!match) throw new Error(`Document not found: ${documentId}`);
      const document = await client.getDocument(project.id, match.id);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: formatDocumentPage(document, 0, 20000),
        }],
      };
    }
  );

  const contextTemplate = new ResourceTemplate('kanvy://projects/{slug}/context', {
    list: async () => {
      const projects = await client.listProjects();
      return {
        resources: projects.map((project) => ({
          uri: `kanvy://projects/${project.slug}/context`,
          name: `${project.slug}-context`,
          title: `${project.name} context`,
          description: 'Project description and pinned documents for agents.',
          mimeType: 'text/markdown',
        })),
      };
    },
  });

  server.registerResource(
    'project-context',
    contextTemplate,
    {
      title: 'Kanvy project context',
      description: 'Project description and pinned documents as a compact context pack.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = variable(variables.slug);
      if (!slug) throw new Error('Missing project slug in resource URI');
      const project = await client.getProject(slug);
      const context = await client.getProjectContext(project.id);
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatProjectContext(context) }],
      };
    }
  );

  const passportTemplate = new ResourceTemplate('kanvy://projects/{slug}/passport', {
    list: async () => {
      const projects = await client.listProjects();
      return {
        resources: projects.map((project) => ({
          uri: `kanvy://projects/${project.slug}/passport`,
          name: `${project.slug}-passport`,
          title: `${project.name} passport`,
          description: 'Operational project passport: stack, commands, environments and owners.',
          mimeType: 'text/markdown',
        })),
      };
    },
  });

  server.registerResource(
    'project-passport',
    passportTemplate,
    {
      title: 'Kanvy project passport',
      description: 'Operational overview of a project for people and agents.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const slug = variable(variables.slug);
      if (!slug) throw new Error('Missing project slug in resource URI');
      const project = await client.getProject(slug);
      const passport = await client.getProjectPassport(project.id);
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatProjectPassport(passport) }],
      };
    }
  );
}
