import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserPrompt } from '../dist/lib/ai/prompts.js';
import { AIResponseError, buildPreviewFromParsed, parseAIResponse } from '../dist/lib/ai/preview.js';
import { estimateTasks, planImport, splitChunkInHalf } from '../dist/lib/ai/import/chunking.js';
import { mergePreviews } from '../dist/lib/ai/import/merge.js';
import { runImportPipeline } from '../dist/lib/ai/import/pipeline.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

async function checkAsync(name, fn) {
  await fn();
  passed++;
  console.log(`ok ${passed} - ${name}`);
}

check('prompt enforces task limits', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /25 tasks total/);
  assert.match(prompt, /160 characters/);
  assert.match(prompt, /At most 4 subtasks/);
});

check('prompt omits unused section/tag ids and colors', () => {
  const prompt = buildSystemPrompt({
    sections: [{ id: 's1', name: 'Backlog', color: '#ff0000' }],
    tags: [{ id: 't1', name: 'api', color: '#00ff00' }],
    members: [{ id: 'u1', name: 'Emmanuel', email: 'emmanuel@example.com' }],
  }, { startDate: '2026-11-05' });
  assert.match(prompt, /Existing sections: "Backlog"/);
  assert.match(prompt, /Existing tags: "api"/);
  assert.match(prompt, /Emmanuel <emmanuel@example.com>/);
  assert.doesNotMatch(prompt, /id: s1/);
  assert.doesNotMatch(prompt, /#ff0000/);
});

check('system prompt stays compact', () => {
  const prompt = buildSystemPrompt();
  assert.ok(prompt.length < 2000, `prompt is ${prompt.length} chars`);
});

check('user prompt truncates long markdown', () => {
  const prompt = buildUserPrompt('x'.repeat(7000));
  assert.match(prompt, /content truncated/);
  assert.ok(prompt.length < 6300, `prompt is ${prompt.length} chars`);
});

check('parser accepts fenced JSON', () => {
  const parsed = parseAIResponse('```json\n{"sections":[{"name":"A","tasks":[{"title":"T"}]}]}\n```');
  assert.equal(parsed.sections[0].name, 'A');
});

check('parser repairs trailing commas and unquoted keys', () => {
  const parsed = parseAIResponse('{sections:[{name:"A",tasks:[{title:"T"},],}],}');
  assert.equal(parsed.sections[0].tasks[0].title, 'T');
});

check('parser rejects unrepairable output without an AI call', () => {
  assert.throws(() => parseAIResponse('not json at all'), AIResponseError);
});

check('preview marks existing sections for reuse', () => {
  const { preview } = buildPreviewFromParsed(
    { sections: [{ name: 'backlog', tasks: [{ title: 'Task', tags: ['api'] }] }] },
    [{ id: 's1', name: 'Backlog', color: '#123456' }]
  );
  assert.equal(preview[0].action, 'reuse');
  assert.equal(preview[0].existingSectionId, 's1');
  assert.equal(preview[0].name, 'Backlog');
  assert.equal(preview[0].color, '#123456');
  assert.equal(preview[0].tasks[0].tags[0].name, 'api');
});

check('preview creates new sections and skips invalid tasks', () => {
  const { preview } = buildPreviewFromParsed({
    sections: [{ name: 'New', tasks: [{ title: 'Valid' }, { nope: true }] }],
  });
  assert.equal(preview[0].action, 'create');
  assert.equal(preview[0].existingSectionId, undefined);
  assert.equal(preview[0].tasks.length, 1);
});

const limits = {
  maxChars: 120000,
  maxChunks: 12,
  maxTasks: 150,
  chunkChars: 300,
  maxOutputTokens: 7168,
  maxTasksPerChunk: 25,
  maxSectionsPerChunk: 6,
};

check('estimateTasks ignores code fences', () => {
  const markdown = '## A\n- one\n- two\n```\n- not a task\n```\n1. three';
  assert.equal(estimateTasks(markdown), 3);
});

check('small documents stay in one block', () => {
  const plan = planImport('## Backlog\n- One\n- Two', limits);
  assert.equal(plan.chunks.length, 1);
  assert.equal(plan.requiresConfirmation, false);
});

check('large documents split into bounded blocks', () => {
  const markdown = Array.from({ length: 12 }, (_, index) => `## Phase ${index}\n- Task ${index} one\n- Task ${index} two\n${'detail '.repeat(30)}`).join('\n\n');
  const plan = planImport(markdown, limits);
  assert.ok(plan.chunks.length > 1, `expected multiple blocks, got ${plan.chunks.length}`);
  assert.ok(plan.chunks.every((chunk) => chunk.text.length <= limits.chunkChars), 'a block exceeded chunkChars');
  assert.equal(plan.requiresConfirmation, true);
});

check('plan rejects too many tasks before calling the AI', () => {
  assert.throws(
    () => planImport('- one\n- two\n- three\n- four', { ...limits, maxTasks: 3 }),
    (error) => error.code === 'IMPORT_TOO_MANY_TASKS' && error.status === 413
  );
});

check('merge deduplicates sections and tasks and unions tags', () => {
  const merged = mergePreviews([
    { projectName: 'Aurora', sections: [{ tempId: 'a', name: 'Backlog', action: 'create', tasks: [{ tempId: '1', title: 'Task one', section: 'Backlog', tags: [{ name: 'api' }], assignees: [], subtasks: [], selected: true }], selected: true }] },
    { sections: [{ tempId: 'b', name: 'backlog', action: 'create', tasks: [{ tempId: '2', title: 'Task one', section: 'backlog', tags: [{ name: 'api' }, { name: 'backend' }], assignees: [], subtasks: [{ title: 'Sub' }], selected: true }], selected: true }] },
  ]);
  assert.equal(merged.sections.length, 1);
  assert.equal(merged.sections[0].tasks.length, 1);
  assert.deepEqual(merged.sections[0].tasks[0].tags.map((tag) => tag.name).sort(), ['api', 'backend']);
  assert.equal(merged.projectName, 'Aurora');
});

check('splitChunkInHalf keeps two useful halves', () => {
  const halves = splitChunkInHalf(`${'a'.repeat(400)}\n\n${'b'.repeat(400)}`);
  assert.ok(halves);
  assert.ok(halves[0].length > 100 && halves[1].length > 100);
});

await checkAsync('pipeline processes multiple blocks and merges the result', async () => {
  const markdown = Array.from({ length: 8 }, (_, index) => `## Phase ${index}\n- Task ${index}\n${'detail '.repeat(40)}`).join('\n\n');
  const plan = planImport(markdown, limits);
  assert.ok(plan.chunks.length > 1);

  const payload = JSON.stringify({
    projectName: 'Aurora',
    sections: [{ name: 'Backlog', tasks: [{ title: 'Shared task', tags: ['api'], assignees: [], subtasks: [] }] }],
  });
  const ai = {
    async chat() {
      return { content: payload, usage: { promptTokens: 10, completionTokens: 5 }, finishReason: 'stop' };
    },
    async *chatStream(_messages, options) {
      options?.onUsage?.({ promptTokens: 10, completionTokens: 5 });
      options?.onFinish?.('stop');
      yield payload;
    },
  };

  const result = await runImportPipeline({
    plan,
    ai,
    limits,
    stream: true,
    context: undefined,
  });
  assert.equal(result.preview.sections.length, 1);
  assert.equal(result.preview.sections[0].tasks.length, 1);
  assert.equal(result.usage.promptTokens, 10 * plan.chunks.length);
  assert.equal(result.usage.completionTokens, 5 * plan.chunks.length);
});

console.log(`\n${passed} AI import checks passed.`);
