import { ResourceTemplate } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import type { KanvyClient } from './kanvyClient.js';
import { formatProjectLine, formatProjectMarkdown } from './format.js';

/** Exposes the project list and one resource per project. */
export function registerResources(server: McpServer, client: KanvyClient): void {
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
      const raw = variables.slug;
      const slug = Array.isArray(raw) ? raw[0] : raw;
      if (!slug) throw new Error('Missing project slug in resource URI');
      const project = await client.getProject(slug);
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: formatProjectMarkdown(project) }],
      };
    }
  );
}
