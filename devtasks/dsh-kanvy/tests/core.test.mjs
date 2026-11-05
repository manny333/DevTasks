import test from 'node:test';
import assert from 'node:assert/strict';
import { KanvyClient, KanvyApiError } from '../lib/core/client.js';
import { formatProjectLine, formatTaskLine, formatSearchResults } from '../lib/core/format.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('client: sends auth and parses JSON', async () => {
  let captured;
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: () => 'dynamic-token',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse([{ id: 'p1', name: 'Demo', slug: 'demo' }]);
    },
  });

  const projects = await client.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(captured.url, 'http://kanvy.test/api/projects');
  assert.equal(captured.init.headers.get('authorization'), 'Bearer dynamic-token');
});

test('client: encodes query parameters', async () => {
  let url;
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 't',
    fetchImpl: async (requestUrl) => {
      url = requestUrl;
      return jsonResponse([]);
    },
  });

  await client.listTasks('sec/1', { status: 'DONE', archived: true });
  assert.match(url, /\/sections\/sec%2F1\/tasks\?archived=true&status=DONE$/);
});

test('client: surfaces API errors without the token', async () => {
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 'secret',
    fetchImpl: async () => jsonResponse({ error: 'No access' }, 403),
  });

  await assert.rejects(
    () => client.getProject('private'),
    (error) => {
      assert.ok(error instanceof KanvyApiError);
      assert.equal(error.status, 403);
      assert.match(error.message, /No access/);
      assert.ok(!error.message.includes('secret'));
      return true;
    }
  );
});

test('format: project line includes counts and access', () => {
  const line = formatProjectLine({
    id: 'p1',
    name: 'Demo',
    slug: 'demo',
    myAccess: { level: 'owner', accessType: 'FULL' },
    _count: { sections: 4, members: 1 },
  });
  assert.match(line, /4 sections/);
  assert.match(line, /owner/);
});

test('format: task line includes status, due date and subtasks', () => {
  const line = formatTaskLine({
    id: 't1',
    title: 'Task',
    status: 'IN_PROGRESS',
    dueDate: '2026-11-10T00:00:00.000Z',
    subtasks: [{ completed: true }, { completed: false }],
  });
  assert.match(line, /\[IN_PROGRESS\]/);
  assert.match(line, /due 2026-11-10/);
  assert.match(line, /1\/2 subtasks/);
});

test('format: search groups projects and tasks', () => {
  const text = formatSearchResults({
    projects: [{ id: 'p1', name: 'Demo', slug: 'demo' }],
    tasks: [{ id: 't1', title: 'Task', status: 'TODO' }],
  });
  assert.match(text, /## Projects \(1\)/);
  assert.match(text, /## Tasks \(1\)/);
});
