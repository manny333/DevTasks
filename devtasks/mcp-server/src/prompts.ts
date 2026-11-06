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
              '2. Usa project_health para el resumen de vencidas, bloqueadas y sin asignar.',
              '3. Usa list_tasks en cada sección relevante (máximo 25 tareas por sección).',
              '4. Resume: progreso por sección, tareas bloqueadas o vencidas, riesgos y próximos pasos.',
              '',
              'Formato: markdown con secciones "Resumen", "Progreso", "Riesgos" y "Próximos pasos". No inventes datos que las tools no devuelvan.',
            ].join('\n'),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'daily_standup',
    {
      title: 'Daily standup',
      description: 'Summarize my assigned work, blockers and what to do next.',
      argsSchema: z.object({
        projectSlug: z.string().optional().describe('Optional project slug to narrow the standup'),
      }),
    },
    ({ projectSlug }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Prepara mi daily standup de Kanvy.',
            projectSlug ? `Proyecto: "${projectSlug}".` : 'Todos mis proyectos.',
            '',
            'Pasos:',
            '1. Usa my_tasks para listar mis tareas asignadas.',
            projectSlug ? '2. Usa project_health para ver el estado del proyecto.' : '2. Usa project_health en los proyectos relevantes.',
            '3. Para las tareas bloqueadas o vencidas, usa get_task y revisa sus dependencias.',
            '',
            'Devuelve: "Ayer", "Hoy", "Bloqueos" y "Riesgos". Sé breve y cita ids de tareas. No modifiques nada sin pedírmelo.',
          ].join('\n'),
        },
      }],
    })
  );

  server.registerPrompt(
    'sprint_planning',
    {
      title: 'Sprint planning',
      description: 'Review a backlog and propose a sprint with capacity, priorities and dependencies.',
      argsSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
        sprintGoal: z.string().optional().describe('Optional sprint goal'),
      }),
    },
    ({ projectSlug, sprintGoal }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Prepara el sprint planning del proyecto Kanvy "${projectSlug}".`,
            sprintGoal ? `Objetivo: ${sprintGoal}.` : '',
            '',
            'Pasos:',
            '1. Usa get_project para ver secciones y tareas.',
            '2. Usa project_health para detectar vencidas, bloqueadas y sin asignar.',
            '3. Usa list_tasks en el backlog y en las tareas en progreso.',
            '4. Propón un sprint de máximo 10 tareas, con prioridad, dependencias y riesgos.',
            '',
            'No crees ni muevas tareas todavía: presenta la propuesta y espera confirmación.',
          ].filter(Boolean).join('\n'),
        },
      }],
    })
  );

  server.registerPrompt(
    'triage_overdue',
    {
      title: 'Triage overdue work',
      description: 'Find overdue and blocked tasks and propose a recovery plan.',
      argsSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
      }),
    },
    ({ projectSlug }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Haz triage de las tareas vencidas y bloqueadas de "${projectSlug}".`,
            '',
            'Pasos:',
            '1. Usa project_health para el panorama general.',
            '2. Usa agenda con un rango que cubra las tareas vencidas y las próximas dos semanas.',
            '3. Usa get_task en las tareas críticas para ver dependencias y último comentario.',
            '4. Clasifica en: "Recuperar ahora", "Replanificar", "Bloqueadas por dependencia" y "Descartar".',
            '',
            'Propón fechas y responsables, pero no modifiques tareas hasta que lo confirme.',
          ].join('\n'),
        },
      }],
    })
  );

  server.registerPrompt(
    'release_notes',
    {
      title: 'Release notes',
      description: 'Draft release notes from completed tasks since a date.',
      argsSchema: z.object({
        projectSlug: z.string().min(1).describe('Project slug'),
        since: z.string().optional().describe('Start date YYYY-MM-DD'),
      }),
    },
    ({ projectSlug, since }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Redacta las release notes de "${projectSlug}".`,
            since ? `Incluye solo tareas completadas desde ${since}.` : 'Incluye las tareas completadas del periodo más reciente.',
            '',
            'Pasos:',
            '1. Usa get_project y list_tasks para localizar las tareas en estado DONE.',
            '2. Agrupa por área (backend, frontend, mobile, infra) y evita detalles internos irrelevantes.',
            '3. Escribe en markdown: "Novedades", "Mejoras" y "Correcciones".',
            '',
            'No inventes tareas: usa solo datos devueltos por las tools.',
          ].join('\n'),
        },
      }],
    })
  );
}
