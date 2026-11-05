import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';

/** Reusable prompt templates exposed by the server. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'project_status_report',
    {
      title: 'Project status report',
      description:
        'Ask the agent to produce a concise status report for a Kanvy project using the Kanvy tools.',
      argsSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug, e.g. "demo-project"'),
      }),
    },
    ({ projectSlug }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Genera un reporte de estado conciso del proyecto Kanvy "${projectSlug}".`,
              '',
              'Pasos:',
              '1. Usa get_project con el slug para ver secciones y conteos.',
              '2. Usa list_tasks en cada sección relevante (máximo 25 tareas por sección).',
              '3. Resume: progreso por sección, tareas bloqueadas o vencidas, riesgos y próximos pasos.',
              '',
              'Formato: markdown con secciones "Resumen", "Progreso", "Riesgos" y "Próximos pasos". No inventes datos que las tools no devuelvan.',
            ].join('\n'),
          },
        },
      ],
    })
  );
}
