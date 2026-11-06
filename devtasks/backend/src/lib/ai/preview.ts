import { jsonrepair } from 'jsonrepair';
import type { AIImportSection } from './types';

export const PREVIEW_COLORS = [
  '#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#14b8a6',
  '#f97316', '#8b5cf6', '#ef4444', '#84cc16',
];

export class AIResponseError extends Error {
  readonly status = 502;

  constructor(message = 'The AI returned invalid JSON. Try again or use a different model.') {
    super(message);
    this.name = 'AIResponseError';
  }
}

/**
 * Parses the model output without spending a second AI call. Code fences and
 * the outermost JSON object are extracted, then `jsonrepair` fixes common
 * syntax issues locally.
 */
export function parseAIResponse(rawContent: string): any {
  let content = rawContent.trim();

  const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) content = codeBlock[1].trim();

  const jsonExtract = content.match(/([\{\[][\s\S]*[\}\]])/);
  if (jsonExtract) content = jsonExtract[1].trim();

  const fixed = content
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^']*)'/g, ':"$1"');

  try {
    return ensureObject(JSON.parse(fixed));
  } catch (error) {
    if (error instanceof AIResponseError) throw error;
    try {
      return ensureObject(JSON.parse(jsonrepair(fixed)));
    } catch {
      throw new AIResponseError();
    }
  }
}

function ensureObject(value: unknown): any {
  if (value === null || typeof value !== 'object') throw new AIResponseError();
  return value;
}

interface ExistingSection {
  id: string;
  name: string;
  color: string;
}

/**
 * Normalizes the parsed JSON into the editable preview. Sections that already
 * exist (case-insensitive name match) are marked for reuse instead of being
 * duplicated by the apply step.
 */
export function buildPreviewFromParsed(
  parsed: any,
  existingSections: ExistingSection[] = []
): { preview: AIImportSection[]; projectName?: string } {
  const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const projectName = typeof parsed?.projectName === 'string' ? parsed.projectName.trim() : undefined;
  const sectionByName = new Map(
    existingSections.map((section) => [section.name.trim().toLowerCase(), section])
  );

  const preview: AIImportSection[] = [];
  let secIdx = 0;
  let taskIdx = 0;

  for (const raw of rawSections) {
    if (!raw?.name || typeof raw.name !== 'string') continue;
    secIdx++;
    const rawName = raw.name.trim();
    const existing = sectionByName.get(rawName.toLowerCase());

    const section: AIImportSection = {
      tempId: `sec-${secIdx}`,
      name: existing?.name ?? rawName,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      action: existing ? 'reuse' : 'create',
      ...(existing ? { existingSectionId: existing.id } : {}),
      color: existing?.color ?? PREVIEW_COLORS[secIdx % PREVIEW_COLORS.length],
      tasks: [],
      selected: true,
    };

    const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
    for (const rt of rawTasks) {
      if (!rt?.title || typeof rt.title !== 'string') continue;
      taskIdx++;
      const tags = (Array.isArray(rt.tags) ? rt.tags : []).map((tag: string) => ({
        name: String(tag),
        action: 'create' as const,
      }));
      const emails = (Array.isArray(rt.assigneeEmails) ? rt.assigneeEmails : []).map((email: string) => ({
        email: String(email),
      }));
      const subtasks = (Array.isArray(rt.subtasks) ? rt.subtasks : []).map((subtask: any) => ({
        title: typeof subtask?.title === 'string' ? subtask.title : String(subtask),
      }));

      section.tasks.push({
        tempId: `task-${taskIdx}`,
        title: rt.title.trim(),
        description: typeof rt.description === 'string' ? rt.description : undefined,
        section: section.name,
        tags,
        assignees: emails,
        subtasks,
        dueDate: typeof rt.dueDate === 'string' && rt.dueDate !== 'null' ? rt.dueDate : undefined,
        startDate: typeof rt.startDate === 'string' && rt.startDate !== 'null' ? rt.startDate : undefined,
        selected: true,
      });
    }

    preview.push(section);
  }

  return { preview, projectName };
}
