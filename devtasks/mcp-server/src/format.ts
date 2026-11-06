import type {
  ActivityItem,
  AttachmentItem,
  CommentItem,
  MemberItem,
  MyTask,
  ProjectDetail,
  ProjectSummary,
  SearchResults,
  SectionSummary,
  SubtaskItem,
  TagItem,
  TaskDetail,
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
    `- ID: \`${project.id}\``,
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

function assigneeNames(task: { assignees?: { user?: { name?: string } }[] }): string {
  return (task.assignees ?? [])
    .map((assignee) => assignee.user?.name)
    .filter((name): name is string => Boolean(name))
    .join(', ');
}

function tagNames(task: { tags?: { tag?: { name?: string } }[] }): string {
  return (task.tags ?? [])
    .map((entry) => entry.tag?.name)
    .filter((name): name is string => Boolean(name))
    .map((name) => `#${name}`)
    .join(' ');
}

export function formatTaskDetail(task: TaskDetail): string {
  const lines = [
    `# ${task.title}`,
    '',
    `- ID: \`${task.id}\``,
    `- Status: ${task.status}${task.archived ? ' (archived)' : ''}`,
    `- Project: ${task.section?.project?.name ?? 'unknown'} (\`${task.section?.project?.slug ?? '?'}\`)`,
    `- Section: ${task.section?.name ?? 'unknown'}`,
    `- Dates: start ${formatDate(task.startDate)} · due ${formatDate(task.dueDate)}`,
  ];

  const assignees = assigneeNames(task);
  if (assignees) lines.push(`- Assignees: ${assignees}`);
  const tags = tagNames(task);
  if (tags) lines.push(`- Tags: ${tags}`);

  if (task.description) lines.push('', task.description);

  if (task.subtasks?.length) {
    lines.push('', `## Subtasks (${task.subtasks.length})`);
    for (const subtask of task.subtasks) {
      lines.push(`- [${subtask.completed ? 'x' : ' '}] ${subtask.title} (\`${subtask.id}\`)`);
    }
  }

  if (task.blockedBy?.length) {
    lines.push('', '## Blocked by');
    for (const dependency of task.blockedBy) {
      if (dependency.dependsOn) {
        lines.push(`- ${dependency.dependsOn.title} (\`${dependency.dependsOn.id}\`) — ${dependency.dependsOn.status}`);
      }
    }
  }

  if (task.blocks?.length) {
    lines.push('', '## Blocks');
    for (const dependency of task.blocks) {
      if (dependency.task) {
        lines.push(`- ${dependency.task.title} (\`${dependency.task.id}\`) — ${dependency.task.status}`);
      }
    }
  }

  if (task.comments?.length) {
    lines.push('', `## Comments (${task.comments.length})`);
    for (const comment of task.comments.slice(-10)) {
      lines.push(`- **${comment.author?.name ?? 'Someone'}** (${formatDate(comment.createdAt)}): ${truncate(comment.content, 300)}`);
    }
  }

  if (task.attachments?.length) {
    lines.push('', `## Attachments (${task.attachments.length})`);
    for (const attachment of task.attachments) {
      lines.push(`- ${attachment.filename} (${attachment.mimeType}, ${attachment.size} bytes)`);
    }
  }

  return lines.join('\n');
}

export function formatComments(comments: CommentItem[]): string {
  if (comments.length === 0) return 'No comments.';
  return [`# Comments (${comments.length})`, '', ...comments.map((comment) =>
    `- **${comment.author?.name ?? 'Someone'}** (${formatDate(comment.createdAt)}): ${truncate(comment.content, 500)}`
  )].join('\n');
}

export function formatSubtasks(subtasks: SubtaskItem[]): string {
  if (subtasks.length === 0) return 'No subtasks.';
  return [`# Subtasks (${subtasks.length})`, '', ...subtasks.map((subtask) =>
    `- [${subtask.completed ? 'x' : ' '}] ${subtask.title} (\`${subtask.id}\`)`
  )].join('\n');
}

export function formatMembers(members: MemberItem[]): string {
  if (members.length === 0) return 'No members.';
  return [`# Members (${members.length})`, '', ...members.map((member) =>
    `- **${member.user.name}** <${member.user.email}> · ${member.role} / ${member.accessType}`
  )].join('\n');
}

export function formatTags(tags: TagItem[]): string {
  if (tags.length === 0) return 'No tags.';
  return [`# Tags (${tags.length})`, '', ...tags.map((tag) => `- ${tag.name} (${tag.color}) — \`${tag.id}\``)].join('\n');
}

export function formatMyTasks(tasks: MyTask[]): string {
  if (tasks.length === 0) return 'No tasks assigned to you.';
  return [`# My tasks (${tasks.length})`, '', ...tasks.map((task) => {
    const project = task.section?.project?.name ?? 'unknown';
    const section = task.section?.name ?? 'unknown';
    return `${formatTaskLine(task)} · ${project} / ${section}`;
  })].join('\n');
}

export function formatAgenda(tasks: TaskSummary[]): string {
  if (tasks.length === 0) return 'No tasks due in that range.';
  return [`# Agenda (${tasks.length})`, '', ...tasks.map(formatTaskLine)].join('\n');
}

export function formatActivity(items: ActivityItem[]): string {
  if (items.length === 0) return 'No activity.';
  return [`# Activity (${items.length})`, '', ...items.map((item) =>
    `- ${formatDate(item.createdAt)} · ${item.action}${item.actorName ? ` by ${item.actorName}` : ''}`
  )].join('\n');
}

export function formatAttachments(items: AttachmentItem[]): string {
  if (items.length === 0) return 'No attachments.';
  return [`# Attachments (${items.length})`, '', ...items.map((item) =>
    `- ${item.filename} (${item.mimeType}, ${item.size} bytes)${item.url ? ` — ${item.url}` : ''}`
  )].join('\n');
}

export function formatProjectHealth(project: ProjectDetail, stats: {
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
  unassigned: number;
  blocked: number;
}): string {
  const completion = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  return [
    `# ${project.name} — health`,
    '',
    `- Completion: ${completion}% (${stats.done}/${stats.total})`,
    `- Overdue: ${stats.overdue}`,
    `- Due in the next 7 days: ${stats.dueSoon}`,
    `- Unassigned: ${stats.unassigned}`,
    `- Blocked: ${stats.blocked}`,
    `- Sections: ${project.sections?.length ?? 0}`,
  ].join('\n');
}
