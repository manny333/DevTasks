/**
 * End-to-end test: a real MCP client talks to the built server over stdio,
 * against a local mock of the Kanvy API. Also smoke-tests the HTTP transport.
 *
 * Usage: npm run test:e2e
 */
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const TOKEN = 'test-token';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const project = {
  id: 'p1',
  name: 'Demo Project',
  slug: 'demo',
  description: 'A demo project',
  myAccess: { level: 'owner', accessType: 'FULL' },
  _count: { sections: 1, members: 2 },
};

const projectDetail = {
  ...project,
  sections: [
    {
      id: 'sec1',
      name: 'Backlog',
      archived: false,
      tasks: [{ id: 'task1', title: 'First task', status: 'DONE' }],
      _count: { tasks: 2 },
    },
  ],
  tags: [{ name: 'backend', color: '#000000' }],
};

const tasks = [
  {
    id: 'task1',
    title: 'First task',
    status: 'IN_PROGRESS',
    dueDate: '2026-11-10T00:00:00.000Z',
    subtasks: [{ completed: true }, { completed: false }],
    assignees: [{ user: { name: 'Emmanuel' } }],
    tags: [{ tag: { name: 'backend' } }],
  },
];

const user = { id: 'u1', name: 'Emmanuel', email: 'emmanuel@example.com' };

const taskDetail = {
  ...tasks[0],
  section: { id: 'sec1', name: 'Backlog', project: { id: 'p1', name: 'Demo Project', slug: 'demo' } },
  subtasks: [{ id: 'st1', title: 'First subtask', completed: true }],
  comments: [{ id: 'c1', content: 'Looks good', createdAt: '2026-11-01T00:00:00.000Z', author: { name: 'Emmanuel' } }],
  blockedBy: [],
  blocks: [],
  attachments: [],
  _count: { comments: 1, subtasks: 1, attachments: 0 },
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const apiServer = http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/projects') {
    sendJson(res, 200, [project]);
    return;
  }
  if (req.method === 'GET' && path === '/api/projects/demo') {
    sendJson(res, 200, projectDetail);
    return;
  }
  if (req.method === 'GET' && path === '/api/sections/sec1/tasks') {
    sendJson(res, 200, tasks);
    return;
  }
  if (req.method === 'GET' && path === '/api/search') {
    sendJson(res, 200, { projects: [project], tasks: [{ ...tasks[0], section: { name: 'Backlog', project: { name: 'Demo', slug: 'demo' } } }] });
    return;
  }
  if (req.method === 'POST' && path === '/api/sections/sec1/tasks') {
    const body = await readBody(req);
    sendJson(res, 201, { id: 'task-new', title: body.title, status: body.status ?? 'TODO' });
    return;
  }
  if (req.method === 'POST' && path === '/api/tasks/task1/comments') {
    const body = await readBody(req);
    sendJson(res, 201, { id: 'comment-1', content: body.content, author: { name: 'Emmanuel' } });
    return;
  }

  if (req.method === 'GET' && path === '/api/tasks/task1') {
    sendJson(res, 200, taskDetail);
    return;
  }
  if (req.method === 'PATCH' && path === '/api/tasks/task1') {
    const body = await readBody(req);
    sendJson(res, 200, { ...taskDetail, ...body });
    return;
  }
  if (req.method === 'PATCH' && path === '/api/tasks/task1/move') {
    const body = await readBody(req);
    sendJson(res, 200, { ...taskDetail, status: body.status });
    return;
  }
  if (req.method === 'GET' && path === '/api/me/tasks') {
    sendJson(res, 200, [{ ...tasks[0], section: { id: 'sec1', name: 'Backlog', project: { id: 'p1', name: 'Demo Project', slug: 'demo' } } }]);
    return;
  }
  if (req.method === 'GET' && path === '/api/auth/me') {
    sendJson(res, 200, user);
    return;
  }
  if (req.method === 'GET' && path === '/api/projects/p1/tags') {
    sendJson(res, 200, [{ id: 'tag1', name: 'backend', color: '#000000' }]);
    return;
  }
  if (req.method === 'GET' && path === '/api/projects/p1/members') {
    sendJson(res, 200, [{ id: 'm1', role: 'OWNER', accessType: 'FULL', user }]);
    return;
  }
  if (req.method === 'POST' && path === '/api/tasks/task1/subtasks') {
    const body = await readBody(req);
    sendJson(res, 201, { id: 'st2', title: body.title, completed: false });
    return;
  }

  sendJson(res, 404, { error: `No mock for ${req.method} ${path}` });
});

await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = apiServer.address().port;
const apiUrl = `http://127.0.0.1:${apiPort}/api`;

function textOf(result) {
  return (result.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

let client;
try {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['build/index.js'],
    env: {
      ...process.env,
      KANVY_API_URL: apiUrl,
      KANVY_TOKEN: TOKEN,
      KANVY_ALLOW_WRITES: '1',
    },
  });
  client = new Client({ name: 'kanvy-e2e', version: '1.0.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  check('lists 29 tools', toolNames.length === 29, `${toolNames.length}: ${toolNames.join(', ')}`);

  const projectsResult = await client.callTool({ name: 'list_projects', arguments: {} });
  check('list_projects returns the project', textOf(projectsResult).includes('Demo Project'));

  const projectResult = await client.callTool({ name: 'get_project', arguments: { slug: 'demo' } });
  check('get_project renders sections and tags', textOf(projectResult).includes('## Sections (1)'));

  const tasksResult = await client.callTool({ name: 'list_tasks', arguments: { sectionId: 'sec1', limit: 5 } });
  check('list_tasks renders task details', textOf(tasksResult).includes('1/2 subtasks'));

  const searchResult = await client.callTool({ name: 'search', arguments: { query: 'demo' } });
  check('search groups results', textOf(searchResult).includes('## Projects (1)'));

  const created = await client.callTool({
    name: 'create_task',
    arguments: { sectionId: 'sec1', title: 'From MCP', status: 'TODO' },
  });
  check('create_task writes', textOf(created).includes('Created task "From MCP"'));

  const comment = await client.callTool({
    name: 'add_comment',
    arguments: { taskId: 'task1', content: 'Looks good' },
  });
  check('add_comment writes', textOf(comment).includes('Comment added'));

  const detail = await client.callTool({ name: 'get_task', arguments: { taskId: 'task1' } });
  check('get_task returns full detail', textOf(detail).includes('## Subtasks (1)'));

  const myTasks = await client.callTool({ name: 'my_tasks', arguments: {} });
  check('my_tasks lists assigned work', textOf(myTasks).includes('My tasks'));

  const who = await client.callTool({ name: 'whoami', arguments: {} });
  check('whoami identifies the user', textOf(who).includes('emmanuel@example.com'));

  const health = await client.callTool({ name: 'project_health', arguments: { projectSlug: 'demo' } });
  check('project_health summarizes the project', textOf(health).includes('Completion'));

  const tags = await client.callTool({ name: 'list_tags', arguments: { projectSlug: 'demo' } });
  check('list_tags returns tag ids', textOf(tags).includes('backend'));

  const updated = await client.callTool({
    name: 'update_task',
    arguments: { taskId: 'task1', title: 'Renamed task' },
  });
  check('update_task writes', textOf(updated).includes('Updated task'));

  const resources = await client.listResources();
  check('lists the projects resource', resources.resources.some((r) => r.uri === 'kanvy://projects'));

  const templates = await client.listResourceTemplates();
  check('lists the project resource template', templates.resourceTemplates.some((t) => t.uriTemplate === 'kanvy://projects/{slug}'));

  const resource = await client.readResource({ uri: 'kanvy://projects/demo' });
  check('reads a project resource', (resource.contents[0]?.text ?? '').includes('# Demo Project'));

  const prompts = await client.listPrompts();
  check('lists the status report prompt', prompts.prompts.some((p) => p.name === 'project_status_report'));

  const prompt = await client.getPrompt({ name: 'project_status_report', arguments: { projectSlug: 'demo' } });
  check('renders the status report prompt', (prompt.messages[0]?.content?.text ?? '').includes('demo'));
} finally {
  await client?.close().catch(() => {});
  await new Promise((resolve) => apiServer.close(resolve));
}

// HTTP transport: health, auth and initialize.
const httpPort = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});

const httpServer = spawn(process.execPath, ['build/index.js'], {
  env: {
    ...process.env,
    KANVY_API_URL: apiUrl,
    KANVY_TOKEN: TOKEN,
    MCP_TRANSPORT: 'http',
    MCP_HTTP_HOST: '127.0.0.1',
    MCP_HTTP_PORT: String(httpPort),
    MCP_HTTP_TOKEN: 'http-secret',
  },
  stdio: 'ignore',
});

try {
  const deadline = Date.now() + 15000;
  let healthOk = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/health`);
      if (response.ok) {
        healthOk = true;
        await response.text();
        break;
      }
    } catch {
      // not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  check('HTTP /health responds', healthOk);

  const unauthorized = await fetch(`http://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  });
  await unauthorized.text();
  check('HTTP /mcp requires the bearer token', unauthorized.status === 401, `status ${unauthorized.status}`);

  const initialized = await fetch(`http://127.0.0.1:${httpPort}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer http-secret',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1.0.0' },
      },
    }),
  });
  await initialized.text();
  check('HTTP /mcp initializes with the token', initialized.status === 200, `status ${initialized.status}`);
} finally {
  httpServer.kill();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed.`);
if (failed.length > 0) process.exitCode = 1;
