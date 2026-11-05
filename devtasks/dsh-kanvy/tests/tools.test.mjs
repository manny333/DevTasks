import test from 'node:test';
import assert from 'node:assert/strict';
import { createKanvyTools } from '../lib/tools.js';

const projects = [
  {
    id: 'p1',
    name: 'Demo Project',
    slug: 'demo',
    myAccess: { level: 'owner', accessType: 'FULL' },
    _count: { sections: 2, members: 3 },
  },
];

const tasks = [
  {
    id: 't1',
    title: 'First task',
    status: 'IN_PROGRESS',
    dueDate: '2026-11-10T00:00:00.000Z',
    subtasks: [{ completed: true }, { completed: false }],
    assignees: [{ user: { name: 'Emmanuel' } }],
  },
  { id: 't2', title: 'Second task', status: 'TODO' },
];

function fakeClient(overrides = {}) {
  return {
    listProjects: async () => projects,
    getProject: async () => ({
      ...projects[0],
      sections: [{ id: 's1', name: 'Backlog', _count: { tasks: 2 } }],
      tags: [{ name: 'backend' }],
    }),
    listTasks: async () => tasks,
    search: async () => ({ projects, tasks }),
    createTask: async (_sectionId, input) => ({ id: 't3', title: input.title, status: input.status ?? 'TODO' }),
    addComment: async () => ({ id: 'c1', content: 'hi', author: { name: 'Emmanuel' } }),
    ...overrides,
  };
}

function byName(tools) {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

test('tools: registers all six native tools', () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  assert.deepEqual(Object.keys(tools).sort(), [
    'kanvy_add_comment',
    'kanvy_create_task',
    'kanvy_get_project',
    'kanvy_list_projects',
    'kanvy_list_tasks',
    'kanvy_search',
  ]);
});

test('tools: list_projects returns text and renders it', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  const result = await tools.kanvy_list_projects.execute({}, {});
  assert.match(result.text, /Demo Project/);
  assert.match(result.text, /2 sections/);

  const rendered = tools.kanvy_list_projects.output.render({}, result);
  assert.equal(rendered[0].type, 'text');
  assert.equal(rendered[0].text, result.text);
});

test('tools: get_project includes sections and tags', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  const result = await tools.kanvy_get_project.execute({ slug: 'demo' }, {});
  assert.match(result.text, /# Demo Project/);
  assert.match(result.text, /Backlog/);
  assert.match(result.text, /#backend/);
});

test('tools: list_tasks clamps the limit and reports totals', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  const result = await tools.kanvy_list_tasks.execute({ sectionId: 's1', limit: 1 }, {});
  assert.match(result.text, /1\/2/);
  assert.equal(result.text.split('\n').filter((line) => line.startsWith('- ')).length, 1);
});

test('tools: search validates the query length', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  await assert.rejects(() => tools.kanvy_search.execute({ query: 'a' }, {}), /at least 2 characters/);
});

test('tools: writes are disabled when configured', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  await assert.rejects(
    () => tools.kanvy_create_task.execute({ sectionId: 's1', title: 'New' }, {}),
    /writes are disabled/
  );
  await assert.rejects(
    () => tools.kanvy_add_comment.execute({ taskId: 't1', content: 'hi' }, {}),
    /writes are disabled/
  );
});

test('tools: writes validate dates and return ids', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: true }));
  await assert.rejects(
    () => tools.kanvy_create_task.execute({ sectionId: 's1', title: 'New', dueDate: '10/11/2026' }, {}),
    /YYYY-MM-DD/
  );

  const created = await tools.kanvy_create_task.execute(
    { sectionId: 's1', title: 'New task', status: 'TODO', dueDate: '2026-11-10' },
    {}
  );
  assert.match(created.text, /Created task "New task"/);
  assert.match(created.text, /TODO/);
});
