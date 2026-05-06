export function buildSystemPrompt(existingContext?: {
  sections?: { id: string; name: string; color: string }[];
  tags?: { id: string; name: string; color: string }[];
  members?: { id: string; name: string; email: string }[];
}, options?: {
  startDate?: string;
  hoursPerDay?: number;
  workDays?: string[];
}): string {
  let prompt = `You are an AI assistant for Kanvy, a Kanban-style project management tool.
Your task is to analyze markdown content and generate a structured JSON output that represents a project with sections, tasks, tags, assignees, and subtasks.

Kanvy data model:
- A project has Sections (columns on a board)
- Each Section has Tasks
- Each Task can have: description, Tags (labels with color), Assignees (team members), Subtasks (checklist items), and an optional dueDate (YYYY-MM-DD)
- Tags belong to a project and can be reused across tasks
- Assignees are identified by their email address

Guidelines:
1. Extract meaningful sections from the markdown (h2/h3 headings are good candidates for section names, but infer them from content structure)
2. Convert lists, bullet points, and action items into tasks
3. If the content describes a software project, use software-appropriate section names (e.g. Backend, Frontend, DevOps, Docs)
4. If the content is a requirements document, create tasks for each requirement
5. Assign reasonable tags based on keywords and context (e.g. "bug", "feature", "docs", "api", "ui", "database", "setup")
6. Break complex items into subtasks when logical
7. Use consistent color schemes for sections (choose from: #6366f1, #f59e0b, #22c55e, #ec4899, #14b8a6, #f97316, #8b5cf6, #ef4444, #84cc16)
8. If assignee names or emails are mentioned, include them`;

  // Time estimation rules
  if (options?.startDate) {
    const hoursPerDay = options.hoursPerDay || 8;
    const workDays = options.workDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    prompt += `

TIME ESTIMATION & DUE DATES:
- Project start date: ${options.startDate} (YYYY-MM-DD)
- Work schedule: ${hoursPerDay}h/day, working days: ${workDays.join(', ')}
- Non-working days: skip weekends and any day not listed above
- If the markdown contains time estimates (e.g. "3 days", "1 week", "2 sprints", "estimated 40 hours"), calculate dueDate based on the start date:
  * Convert the estimate to hours (1 day = ${hoursPerDay}h, 1 week = ${hoursPerDay * 5}h)
  * Count working days forward from the start date, skipping non-working days
  * Set dueDate to the calculated date (YYYY-MM-DD)
- If a task depends on another task (mentioned as "after X", "depends on"), factor in dependency ordering
- Tasks without explicit estimates get a reasonable dueDate based on their complexity relative to the project scope
- The first tasks should have due dates close to the start date; later tasks should be further out`;
  } else {
    prompt += `
9. If due dates or deadlines are mentioned, extract them`;
  }

  prompt += `

Return ONLY valid JSON in this exact format:
{
  "projectName": "A concise, descriptive project name based on the content",
  "sections": [
    {
      "name": "Section Name",
      "description": "Brief description",
      "tasks": [
        {
          "title": "Task title",
          "description": "Task description with details",
          "tags": ["tag1", "tag2"],
          "assigneeEmails": ["user@example.com"],
          "subtasks": [{ "title": "Subtask title" }],
          "dueDate": "YYYY-MM-DD"
        }
      ]
    }
  ]
}

Important:
- Return ONLY the JSON object, no markdown code blocks, no explanation
- Use double quotes for all strings
- Every task must have at least a title
- Tags and assigneeEmails arrays can be empty
- subtasks array can be empty
- dueDate can be omitted if not applicable`;

  if (existingContext) {
    prompt += `\n\nThis is an EXISTING project. Prefer reusing existing sections, tags, and assignees when they semantically match. Only create new ones if absolutely necessary.

EXISTING SECTIONS (reuse when possible):
${(existingContext.sections || []).map(s => `- "${s.name}" (id: ${s.id}, color: ${s.color})`).join('\n')}

EXISTING TAGS (reuse the EXACT name when possible):
${(existingContext.tags || []).map(t => `- "${t.name}" (id: ${t.id}, color: ${t.color})`).join('\n')}

EXISTING MEMBERS (use their real email when assigning):
${(existingContext.members || []).map(m => `- ${m.name} (email: ${m.email}, id: ${m.id})`).join('\n')}

When a task fits an existing section, use that section name exactly. When a tag already exists with the right concept, reuse it. When assigning, use members' real emails from the list above.`;
  }

  return prompt;
}

export function buildUserPrompt(markdown: string, projectName?: string): string {
  const truncated = markdown.length > 6000 ? markdown.slice(0, 6000) + '\n\n[... content truncated ...]' : markdown;
  let prompt = `Analyze this markdown content and generate a Kanvy project structure`;
  if (projectName) prompt += ` for a project named "${projectName}"`;
  prompt += `:\n\n${truncated}`;
  return prompt;
}
