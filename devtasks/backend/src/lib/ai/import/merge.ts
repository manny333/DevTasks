import type { AIImportSection, AIImportTask, AIImportTag, AIImportAssignee, AIImportPreview } from '../types';

interface ExistingSection {
  id: string;
  name: string;
  color: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeTags(target: AIImportTag[], incoming: AIImportTag[]): AIImportTag[] {
  const byName = new Map(target.map((tag) => [normalize(tag.name), tag]));
  for (const tag of incoming) {
    const key = normalize(tag.name);
    if (!byName.has(key)) {
      const copy = { ...tag };
      target.push(copy);
      byName.set(key, copy);
    }
  }
  return target;
}

function mergeAssignees(target: AIImportAssignee[], incoming: AIImportAssignee[]): AIImportAssignee[] {
  const byEmail = new Map(target.map((assignee) => [assignee.email.toLowerCase(), assignee]));
  for (const assignee of incoming) {
    const key = assignee.email.toLowerCase();
    if (!byEmail.has(key)) {
      const copy = { ...assignee };
      target.push(copy);
      byEmail.set(key, copy);
    }
  }
  return target;
}

function mergeSubtasks(target: AIImportTask['subtasks'], incoming: AIImportTask['subtasks']): void {
  const seen = new Set(target.map((subtask) => normalize(subtask.title)));
  for (const subtask of incoming) {
    const key = normalize(subtask.title);
    if (!seen.has(key)) {
      target.push({ ...subtask });
      seen.add(key);
    }
  }
}

function mergeTask(target: AIImportTask, incoming: AIImportTask): void {
  if ((incoming.description?.length ?? 0) > (target.description?.length ?? 0)) {
    target.description = incoming.description;
  }
  target.startDate ??= incoming.startDate;
  target.dueDate ??= incoming.dueDate;
  mergeTags(target.tags, incoming.tags);
  mergeAssignees(target.assignees, incoming.assignees);
  mergeSubtasks(target.subtasks, incoming.subtasks);
  target.selected = target.selected || incoming.selected;
}

/**
 * Merges the previews from several blocks. Sections are matched by normalized
 * name; tasks inside a section are deduplicated by normalized title, keeping
 * the richest description and unioning tags, assignees and subtasks.
 */
export function mergePreviews(
  previews: AIImportPreview[],
  existingSections: ExistingSection[] = []
): AIImportPreview {
  const existingByName = new Map(existingSections.map((section) => [normalize(section.name), section]));
  const sections = new Map<string, AIImportSection>();
  let projectName: string | undefined;

  for (const preview of previews) {
    if (!projectName && preview.projectName) projectName = preview.projectName;

    for (const section of preview.sections) {
      const key = normalize(section.name);
      let target = sections.get(key);

      if (!target) {
        const existing = existingByName.get(key);
        target = {
          ...section,
          name: existing?.name ?? section.name,
          action: existing ? 'reuse' : section.action,
          ...(existing ? { existingSectionId: existing.id } : {}),
          color: existing?.color ?? section.color,
          tasks: [],
          selected: section.selected,
        };
        sections.set(key, target);
      } else {
        if ((section.description?.length ?? 0) > (target.description?.length ?? 0)) {
          target.description = section.description;
        }
        target.selected = target.selected || section.selected;
      }

      for (const task of section.tasks) {
        const taskKey = normalize(task.title);
        const existingTask = target.tasks.find((candidate) => normalize(candidate.title) === taskKey);
        if (existingTask) {
          mergeTask(existingTask, task);
        } else {
          target.tasks.push({
            ...task,
            section: target.name,
            tags: task.tags.map((tag) => ({ ...tag })),
            assignees: task.assignees.map((assignee) => ({ ...assignee })),
            subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
          });
        }
      }
    }
  }

  const merged = [...sections.values()];
  let taskIndex = 0;
  merged.forEach((section, sectionIndex) => {
    section.tempId = `sec-${sectionIndex + 1}`;
    for (const task of section.tasks) {
      task.tempId = `task-${++taskIndex}`;
      task.section = section.name;
      task.selected = true;
    }
    section.selected = true;
  });

  return { sections: merged, ...(projectName ? { projectName } : {}) };
}
