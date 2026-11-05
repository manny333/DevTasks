import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolHandlers } from '../build/tools.js';

const projects = [
  {
    id: 'p1',
    name: 'Demo Project',
    slug: 'demo-project',
    description: 'A demo',
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
    tags: [{ tag: { name: 'backend' } }],
  },
  { id: 't2', title: 'Second task', status: 'TODO' },
];

function fakeClient(overrides = {}) {
  return {
    listProjects: async () => projects,
    getProject: async () => ({
      ...projects[0],
      sections: [
        {
          id: 's1',
          name: 'Backlog',
          archived: false,
          tasks: [{ id: 't1', title: 'First task', status: 'DONE' }],
          _count: { tasks: 2 },
        },
      ],
      tags: [{ name: 'backend', color: '#000' }],
    }),
    listTasks: async () => tasks,
    search: async () => ({ projects, tasks }),
    createTask: async (_sectionId, input) => ({ id: 't3', title: input.title, status: input.status ?? 'TODO' }),
    addComment: async () => ({ id: 'c1', content: 'hi', author: { name: 'Emmanuel' } }),
    ...overrides,
  };
}

test('tools: list_projects formats counts and access', async () => {
  const handlers = createToolHandlers(fakeClient(), { allowWrites: false });
  const output = await handlers.list_projects();
  assert.match(output, /Demo Project/);
  assert.match(output, /2 sections/);
  assert.match(output, /3 members/);
  assert.match(output, /owner/);
});

test('tools: list_projects handles an empty account', async () => {
  const handlers = createToolHandlers(fakeClient({ listProjects: async () => [] }), { allowWrites: false });
  assert.match(await handlers.list_projects(), /No projects/);
});

test('tools: get_project renders sections and tags', async () => {
  const handlers = createToolHandlers(fakeClient(), { allowWrites: false });
  const output = await handlers.get_project({ slug: 'demo-project' });
  assert.match(output, /# Demo Project/);
  assert.match(output, /## Sections \(1\)/);
  assert.match(output, /Backlog/);
  assert.match(output, /#backend/);
});

test('tools: list_tasks renders status, due date, subtasks and assignees', async () => {
  const handlers = createToolHandlers(fakeClient(), { allowWrites: false });
  const output = await handlers.list_tasks({ sectionId: 's1' });
  assert.match(output, /\[IN_PROGRESS\]/);
  assert.match(output, /due 2026-11-10/);
  assert.match(output, /1\/2 subtasks/);
  assert.match(output, /@Emmanuel/);
  assert.match(output, /#backend/);
});

test('tools: list_tasks clamps the limit and reports the total', async () => {
  const many = Array.from({ length: 10 }, (_, index) => ({
    id: `t${index}`,
    title: `Task ${index}`,
    status: 'TODO',
  }));
  const handlers = createToolHandlers(fakeClient({ listTasks: async () => many }), { allowWrites: false });
  const output = await handlers.list_tasks({ sectionId: 's1', limit: 3 });
  assert.match(output, /3\/10/);
  assert.equal(output.split('\n').filter((line) => line.startsWith('- ')).length, 3);
});

test('tools: search groups projects and tasks', async () => {
  const handlers = createToolHandlers(fakeClient(), { allowWrites: false });
  const output = await handlers.search({ query: 'demo' });
  assert.match(output, /## Projects \(1\)/);
  assert.match(output, /## Tasks \(2\)/);
});

test('tools: writes are disabled by default', async () => {
  const handlers = createToolHandlers(fakeClient(), { allowWrites: false });
  await assert.rejects(
    () => handlers.create_task({ sectionId: 's1', title: 'New' }),
    /Writes are disabled/
  );
  await assert.rejects(
    () => handlers.add_comment({ taskId: 't1', content: 'hi' }),
    /Writes are disabled/
  );
});

test('tools: writes work when enabled', async () => {
  const handlers = createToolHandlers(fakeClient(), { allowWrites: true });
  const created = await handlers.create_task({ sectionId: 's1', title: 'New task', status: 'TODO' });
  assert.match(created, /Created task "New task"/);
  assert.match(created, /TODO/);

  const comment = await handlers.add_comment({ taskId: 't1', content: 'Looks good' });
  assert.match(comment, /Comment added/);
  assert.match(comment, /Emmanuel/);
});
