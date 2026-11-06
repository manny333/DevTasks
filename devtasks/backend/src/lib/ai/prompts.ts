export const MAX_MARKDOWN_CHARS = 6000;

export function buildSystemPrompt(existingContext?: {
  sections?: { id: string; name: string; color: string }[];
  tags?: { id: string; name: string; color: string }[];
  members?: { id: string; name: string; email: string }[];
}, options?: {
  startDate?: string;
  hoursPerDay?: number;
  workDays?: string[];
}): string {
  let prompt = `You convert markdown into a Kanvy project. Return ONLY one JSON object, no markdown fences, no prose.

JSON shape:
{"projectName":"...","sections":[{"name":"...","description":"...","tasks":[{"title":"...","description":"...","tags":["..."],"assigneeEmails":["..."],"subtasks":[{"title":"..."}],"startDate":"YYYY-MM-DD","dueDate":"YYYY-MM-DD"}]}]}

Rules:
- Cover every distinct requirement, bullet or action item with its own task.
- At most 6 sections and 25 tasks total. At most 4 subtasks per task.
- description: one short sentence, maximum 160 characters. Omit it if the title is enough.
- tags: 0-3 per task, lowercase. Reuse existing tag names exactly when they match.
- assigneeEmails: only emails from the member list. Never invent people.
- Prefer existing section names when the content fits them.
- Every task needs a title. tags, assigneeEmails and subtasks may be [].
- Use double quotes and no trailing commas.`;

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

  if (existingContext) {
    const sections = (existingContext.sections || []).map((section) => `"${section.name}"`).join(', ');
    const tags = (existingContext.tags || []).map((tag) => `"${tag.name}"`).join(', ');
    const members = (existingContext.members || []).map((member) => `${member.name} <${member.email}>`).join(', ');

    prompt += `

This is an EXISTING project. Reuse names when they match.
Existing sections: ${sections || '(none)'}
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
