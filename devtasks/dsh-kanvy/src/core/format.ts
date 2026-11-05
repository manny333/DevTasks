import type {
  ProjectDetail,
  ProjectSummary,
  SearchResults,
  SectionSummary,
  TaskSummary,
} from './types.js';

/** Cuts long strings so tool output stays within a sensible token budget. */
export function truncate(value: string, max = 4000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… (${value.length - max} more characters)`;
}

export function formatDate(value?: string | null): string {
  if (!value) return 'no date';
  return value.slice(0, 10);
}

export function accessLabel(project: ProjectSummary): string {
  if (!project.myAccess) return 'unknown access';
  if (project.myAccess.level === 'owner') return 'owner';
  return `${project.myAccess.accessType.toLowerCase()} (${project.myAccess.level})`;
}

export function formatProjectLine(project: ProjectSummary): string {
  const sections = project._count?.sections ?? 0;
  const members = project._count?.members ?? 0;
  const description = project.description ? ` — ${truncate(project.description, 120)}` : '';
  return `- **${project.name}** (\`${project.slug}\`) · ${sections} sections · ${members} members · ${accessLabel(project)}${description}`;
}

export function formatTaskLine(task: TaskSummary): string {
  const parts = [`- [${task.status}] **${task.title}** (\`${task.id}\`)`];
  if (task.dueDate) parts.push(`due ${formatDate(task.dueDate)}`);
  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter((subtask) => subtask.completed).length;
    parts.push(`${done}/${task.subtasks.length} subtasks`);
  }
  if (task.assignees && task.assignees.length > 0) {
    const names = task.assignees
      .map((assignee) => assignee.user?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) parts.push(`@${names.join(', @')}`);
  }
  if (task.tags && task.tags.length > 0) {
    const tags = task.tags
      .map((entry) => entry.tag?.name)
      .filter((name): name is string => Boolean(name));
    if (tags.length > 0) parts.push(tags.map((tag) => `#${tag}`).join(' '));
  }
  return parts.join(' · ');
}

export function formatSectionLine(section: SectionSummary): string {
  const taskCount = section._count?.tasks ?? section.tasks?.length ?? 0;
  const done = section.tasks?.filter((task) => task.status === 'DONE').length ?? 0;
  const archived = section.archived ? ' (archived)' : '';
  return `- **${section.name}**${archived} · ${taskCount} tasks · ${done} done · \`${section.id}\``;
}

export function formatProjectMarkdown(project: ProjectDetail): string {
  const lines: string[] = [
    `# ${project.name}`,
    '',
    `- Slug: \`${project.slug}\``,
    `- Access: ${accessLabel(project)}`,
  ];
  if (project.description) lines.push('', project.description);

  const sections = project.sections ?? [];
  lines.push('', `## Sections (${sections.length})`);
  if (sections.length === 0) {
    lines.push('No sections yet.');
  } else {
    for (const section of sections) {
      lines.push(formatSectionLine(section));
    }
  }

  const tags = project.tags ?? [];
  if (tags.length > 0) {
    lines.push('', `## Tags (${tags.length})`);
    lines.push(tags.map((tag) => `#${tag.name}`).join(' '));
  }

  return lines.join('\n');
}

export function formatSearchResults(results: SearchResults): string {
  const sections: string[] = [];
  const projects = results.projects ?? [];
  const tasks = results.tasks ?? [];

  if (projects.length > 0) {
    sections.push(`## Projects (${projects.length})`);
    sections.push(...projects.map(formatProjectLine));
  }

  if (tasks.length > 0) {
    sections.push(`## Tasks (${tasks.length})`);
    for (const task of tasks) {
      const context = task.section?.project?.slug
        ? ` · ${task.section.project.name ?? task.section.project.slug} / ${task.section.name ?? 'section'}`
        : '';
      sections.push(`${formatTaskLine(task)}${context}`);
    }
  }

  if (sections.length === 0) return 'No matches.';
  return sections.join('\n');
}
