import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserPrompt } from '../dist/lib/ai/prompts.js';
import { AIResponseError, buildPreviewFromParsed, parseAIResponse } from '../dist/lib/ai/preview.js';

let passed = 0;
function check(name, fn) {
  fn();
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

console.log(`\n${passed}/9 AI import checks passed.`);
