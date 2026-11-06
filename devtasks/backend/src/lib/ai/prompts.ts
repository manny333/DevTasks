export const MAX_MARKDOWN_CHARS = 6000;

export function buildSystemPrompt(existingContext?: {
  sections?: { id: string; name: string; color: string }[];
  tags?: { id: string; name: string; color: string }[];
  members?: { id: string; name: string; email: string }[];
}, options?: {
  startDate?: string;
  hoursPerDay?: number;
  workDays?: string[];
  maxTasks?: number;
  maxSections?: number;
  knownSections?: string[];
  chunk?: { index: number; total: number; heading?: string };
}): string {
  const maxTasks = options?.maxTasks ?? 25;
  const maxSections = options?.maxSections ?? 6;
  let prompt = `You convert markdown into a Kanvy project. Return ONLY one JSON object, no markdown fences, no prose.

JSON shape:
{"projectName":"...","sections":[{"name":"...","description":"...","tasks":[{"title":"...","description":"...","tags":["..."],"assigneeEmails":["..."],"subtasks":[{"title":"..."}],"startDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD"}]}]}

Rules:
- Cover every distinct requirement, bullet or action item with its own task.
- At most ${maxSections} sections and ${maxTasks} tasks total. At most 4 subtasks per task.
- description: one short sentence, maximum 160 characters. Omit it if the title is enough.
- tags: 0-3 per task, lowercase. Reuse existing tag names exactly when they match.
- assigneeEmails: only emails from the member list. Never invent people.
- Prefer existing section names when the content fits them.
- Every task needs a title. tags, assigneeEmails and subtasks may be [].
- Use double quotes and no trailing commas.`;

  if (options?.chunk) {
    const heading = options.chunk.heading ? ` (${options.chunk.heading})` : '';
    prompt += `

This is block ${options.chunk.index}/${options.chunk.total}${heading} of a larger document. Extract only the work described in this block. Sections may appear in several blocks; use the same section names so the blocks can be merged.`;
  }

  if (options?.startDate) {
    const hoursPerDay = options.hoursPerDay || 8;
    const workDays = options.workDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    prompt += `

Dates:
- Project starts ${options.startDate}. Work ${hoursPerDay}h/day on ${workDays.join(', ')}.
- If the markdown gives estimates ("3 days", "1 week"), compute dueDate by adding working days from the start date and skipping non-working days.
- Use YYYY-MM-DD. If no date or estimate exists, use null.`;
  } else {
    prompt += `\n- If the markdown mentions dates or deadlines, copy them as YYYY-MM-DD; otherwise use null.`;
  }

  if (existingContext || (options?.knownSections?.length ?? 0) > 0) {
    const sections = [
      ...(existingContext?.sections || []).map((section) => section.name),
      ...(options?.knownSections || []),
    ];
    const uniqueSections = [...new Set(sections)];
    const tags = (existingContext?.tags || []).map((tag) => `"${tag.name}"`).join(', ');
    const members = (existingContext?.members || []).map((member) => `${member.name} <${member.email}>`).join(', ');

    prompt += `

This is an EXISTING project. Reuse names when they match.
Existing sections: ${uniqueSections.map((name) => `"${name}"`).join(', ') || '(none)'}
Existing tags: ${tags || '(none)'}
Members: ${members || '(none)'}`;
  }

  return prompt;
}

export function buildUserPrompt(markdown: string, projectName?: string): string {
  const truncated = markdown.length > MAX_MARKDOWN_CHARS
    ? markdown.slice(0, MAX_MARKDOWN_CHARS) + '\n\n[content truncated: only the first 6000 characters were processed]'
    : markdown;
  let prompt = 'Extract the Kanvy structure from this markdown';
  if (projectName) prompt += ` for a project named "${projectName}"`;
  prompt += `:\n\n${truncated}`;
  return prompt;
}

export function buildChunkUserPrompt(
  markdown: string,
  projectName?: string,
  chunk?: { index: number; total: number; heading?: string }
): string {
  let prompt = 'Extract the Kanvy structure from this markdown block';
  if (projectName) prompt += ` for a project named "${projectName}"`;
  if (chunk) {
    const heading = chunk.heading ? ` (${chunk.heading})` : '';
    prompt += ` — block ${chunk.index}/${chunk.total}${heading}`;
  }
  prompt += `:\n\n${markdown}`;
  return prompt;
}
