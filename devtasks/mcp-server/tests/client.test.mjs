import test from 'node:test';
import assert from 'node:assert/strict';
import { KanvyClient, KanvyApiError } from '../build/kanvyClient.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('client: sends auth header and parses JSON', async () => {
  let captured;
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 'secret-token',
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse([{ id: 'p1', name: 'Demo', slug: 'demo' }]);
    },
  });

  const projects = await client.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(captured.url, 'http://kanvy.test/api/projects');
  assert.equal(captured.init.headers.get('authorization'), 'Bearer secret-token');
  assert.equal(captured.init.headers.get('accept'), 'application/json');
});

test('client: encodes path and query parameters', async () => {
  const urls = [];
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 't',
    fetchImpl: async (url) => {
      urls.push(url);
      return jsonResponse([]);
    },
  });

  await client.getProject('demo project');
  await client.listTasks('sec/1', { status: 'DONE', archived: true });
  await client.search('hola mundo');

  assert.equal(urls[0], 'http://kanvy.test/api/projects/demo%20project');
  assert.match(urls[1], /\/sections\/sec%2F1\/tasks\?archived=true&status=DONE$/);
  assert.match(urls[2], /\/search\?q=hola%20mundo$/);
});

test('client: surfaces API errors without leaking the token', async () => {
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 'super-secret',
    fetchImpl: async () => jsonResponse({ error: 'No access to this project' }, 403),
  });

  await assert.rejects(
    () => client.getProject('private'),
    (error) => {
      assert.ok(error instanceof KanvyApiError);
      assert.equal(error.status, 403);
      assert.match(error.message, /No access to this project/);
      assert.ok(!error.message.includes('super-secret'));
      return true;
    }
  );
});

test('client: times out with a 504 error', async () => {
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 't',
    timeoutMs: 20,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  });

  await assert.rejects(
    () => client.listProjects(),
    (error) => error instanceof KanvyApiError && error.status === 504
  );
});

test('client: maps network failures to 502', async () => {
  const client = new KanvyClient({
    apiUrl: 'http://kanvy.test/api',
    token: 't',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });

  await assert.rejects(
    () => client.listProjects(),
    (error) => error instanceof KanvyApiError && error.status === 502 && /Could not reach/.test(error.message)
  );
});
