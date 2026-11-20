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
    getTask: async () => ({
      ...tasks[0],
      section: { id: 's1', name: 'Backlog', project: { id: 'p1', name: 'Demo', slug: 'demo' } },
      subtasks: [{ id: 'sub1', title: 'Check', completed: false }],
    }),
    getMe: async () => ({ id: 'u1', name: 'Emmanuel', email: 'em@example.com' }),
    updateTask: async (_taskId, input) => ({ id: 't1', title: input.title ?? 'First task', status: 'TODO' }),
    listDocuments: async () => [{
      id: 'doc1',
      title: 'Demo specification',
      slug: 'demo-specification',
      category: 'SPEC',
      source: 'EDITOR',
      isPinned: true,
      isArchived: false,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      author: { id: 'u1', name: 'Emmanuel' },
      excerpt: 'The demo project specification.',
      size: 28,
    }],
    getDocument: async () => ({
      id: 'doc1',
      title: 'Demo specification',
      slug: 'demo-specification',
      category: 'SPEC',
      source: 'EDITOR',
      isPinned: true,
      isArchived: false,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      author: { id: 'u1', name: 'Emmanuel' },
      excerpt: 'The demo project specification.',
      size: 28,
      content: '# Demo specification\n\nThe demo project specification.',
    }),
    getProjectContext: async () => ({
      project: { id: 'p1', name: 'Demo Project', slug: 'demo' },
      documents: [],
      content: '# Demo Project\n\n## Demo specification',
      truncated: false,
    }),
    getProjectPassport: async () => ({
      project: { id: 'p1', name: 'Demo Project', slug: 'demo', createdAt: '2026-01-01T00:00:00.000Z' },
      profile: {
        projectId: 'p1',
        purpose: 'Demo purpose',
        repoUrl: 'https://github.com/example/demo',
        defaultBranch: 'main',
        stack: 'React + Express',
        setupCommands: 'npm install',
        runCommands: 'npm run dev',
        testCommands: 'npm test',
        deployUrl: null,
        stagingUrl: null,
        owners: 'Emmanuel',
        onCall: 'Emmanuel',
        startHere: '# Start here',
        updatedBy: { id: 'u1', name: 'Emmanuel' },
        updatedAt: '2026-11-03T00:00:00.000Z',
      },
    }),
    ...overrides,
  };
}

function byName(tools) {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

test('tools: registers all 34 native tools', () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  assert.deepEqual(Object.keys(tools).sort(), [
    'kanvy_add_comment',
    'kanvy_add_dependency',
    'kanvy_add_member',
    'kanvy_add_subtask',
    'kanvy_add_tag',
    'kanvy_agenda',
    'kanvy_archive_task',
    'kanvy_assign_task',
    'kanvy_bulk_create_tasks',
    'kanvy_create_project',
    'kanvy_create_section',
    'kanvy_create_tag',
    'kanvy_create_task',
    'kanvy_get_document',
    'kanvy_get_project',
    'kanvy_get_project_context',
    'kanvy_get_project_passport',
    'kanvy_get_task',
    'kanvy_list_activity',
    'kanvy_list_attachments',
    'kanvy_list_comments',
    'kanvy_list_documents',
    'kanvy_list_members',
    'kanvy_list_projects',
    'kanvy_list_tags',
    'kanvy_list_tasks',
    'kanvy_move_task',
    'kanvy_my_tasks',
    'kanvy_project_health',
    'kanvy_search',
    'kanvy_search_documents',
    'kanvy_update_subtask',
    'kanvy_update_task',
    'kanvy_whoami',
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
  await assert.rejects(
    () => tools.kanvy_update_task.execute({ taskId: 't1', title: 'Nope' }, {}),
    /writes are disabled/
  );
});

test('tools: get_task renders the full detail', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  const result = await tools.kanvy_get_task.execute({ taskId: 't1' }, {});
  assert.match(result.text, /# First task/);
  assert.match(result.text, /Section: Backlog/);
  assert.match(result.text, /Check/);
});

test('tools: whoami uses the authenticated user', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  const result = await tools.kanvy_whoami.execute({}, {});
  assert.match(result.text, /Emmanuel/);
  assert.match(result.text, /em@example.com/);
});

test('tools: bulk dry run lists tasks without writing', async () => {
  let writes = 0;
  const tools = byName(createKanvyTools(fakeClient({
    createTask: async () => {
      writes++;
      return { id: 't4', title: 'unused', status: 'TODO' };
    },
  }), { allowWrites: true }));
  const result = await tools.kanvy_bulk_create_tasks.execute({
    sectionId: 's1',
    tasks: [{ title: 'One' }, { title: 'Two' }],
    dryRun: true,
  }, {});
  assert.match(result.text, /Dry run: 2 task/);
  assert.equal(writes, 0);
});

test('tools: documents can be listed and read by slug', async () => {
  const tools = byName(createKanvyTools(fakeClient(), { allowWrites: false }));
  const list = await tools.kanvy_list_documents.execute({ projectSlug: 'demo' }, {});
  assert.match(list.text, /Demo specification/);
  assert.match(list.text, /demo-specification/);

  const doc = await tools.kanvy_get_document.execute({
    projectSlug: 'demo',
    documentId: 'demo-specification',
  }, {});
  assert.match(doc.text, /# Demo specification/);
  assert.match(doc.text, /The demo project specification/);

  const context = await tools.kanvy_get_project_context.execute({ projectSlug: 'demo' }, {});
  assert.match(context.text, /Demo specification/);

  const passport = await tools.kanvy_get_project_passport.execute({ projectSlug: 'demo' }, {});
  assert.match(passport.text, /## Setup/);
  assert.match(passport.text, /npm install/);
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
