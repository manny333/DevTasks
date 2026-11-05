import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';

function fakeContext() {
  const registered = [];
  return {
    registered,
    effect(callback) {
      const dispose = callback();
      if (typeof dispose === 'function') dispose();
    },
    tools: {
      register(tool) {
        registered.push(tool);
        return () => {};
      },
    },
  };
}

test('plugin: registers six tools on a DSH-like context', () => {
  const ctx = fakeContext();
  apply(ctx, { apiUrl: 'http://kanvy.test/api', token: 'test-token', allowWrites: false });

  const names = ctx.registered.map((tool) => tool.name).sort();
  assert.equal(names.length, 6);
  assert.ok(names.includes('kanvy_list_projects'));
  assert.ok(names.includes('kanvy_create_task'));
});

test('plugin: executes a tool against a mocked fetch', async () => {
  const ctx = fakeContext();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://kanvy.test/api/projects');
    assert.equal(init.headers.get('authorization'), 'Bearer test-token');
    return new Response(
      JSON.stringify([
        {
          id: 'p1',
          name: 'Demo Project',
          slug: 'demo',
          myAccess: { level: 'owner', accessType: 'FULL' },
          _count: { sections: 2, members: 1 },
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  try {
    apply(ctx, { apiUrl: 'http://kanvy.test/api', token: 'test-token', allowWrites: false });
    const tool = ctx.registered.find((entry) => entry.name === 'kanvy_list_projects');
    assert.ok(tool);
    const result = await tool.execute({}, {});
    assert.match(result.text, /Demo Project/);
    assert.match(result.text, /2 sections/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('plugin: read-only mode blocks writes through the context', async () => {
  const ctx = fakeContext();
  apply(ctx, { apiUrl: 'http://kanvy.test/api', token: 'test-token', allowWrites: false });
  const tool = ctx.registered.find((entry) => entry.name === 'kanvy_create_task');
  assert.ok(tool);
  await assert.rejects(() => tool.execute({ sectionId: 's1', title: 'Nope' }, {}), /writes are disabled/);
});
