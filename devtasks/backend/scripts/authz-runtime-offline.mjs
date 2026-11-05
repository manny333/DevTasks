/**
 * HTTP authorization test without a database.
 *
 * Boots the compiled server (dist/index.js) with an in-memory Prisma fixture,
 * signs two real JWTs and checks that account B gets 403 from every
 * project-scoped endpoint while the owner (A) still gets 200. This exercises
 * the actual Express middleware and route handlers, which is the part the
 * static audit cannot prove.
 *
 * Usage: npm run build && npm run test:http
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaPath = path.join(backendDir, 'dist', 'lib', 'prisma.js');
const backupPath = `${prismaPath}.authz-backup`;
const PORT = Number(process.env.AUTHZ_TEST_PORT || 5099);
const API = `http://127.0.0.1:${PORT}/api`;

const USER_A = 'user_authz_owner';
const USER_B = 'user_authz_stranger';
const PROJECT = 'project_authz';
const SECTION = 'section_authz';
const TASK = 'task_authz';

const FIXTURE_MODULE = `
const USER_A = ${JSON.stringify(USER_A)};
const USER_B = ${JSON.stringify(USER_B)};
const PROJECT = ${JSON.stringify(PROJECT)};
const SECTION = ${JSON.stringify(SECTION)};
const TASK = ${JSON.stringify(TASK)};

const project = { id: PROJECT, name: 'Authz project', slug: 'authz-project', description: null, ownerId: USER_A, createdAt: new Date() };
const section = { id: SECTION, name: 'Authz section', description: null, color: '#6366f1', position: 0, archived: false, projectId: PROJECT, createdAt: new Date() };
const task = {
  id: TASK,
  title: 'Authz task',
  description: null,
  status: 'TODO',
  archived: false,
  position: 0,
  sectionId: SECTION,
  startDate: null,
  dueDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  section: { id: SECTION, projectId: PROJECT },
};

const fake = {
  project: {
    findUnique: async (args) => {
      const where = (args && args.where) || {};
      if (where.id !== PROJECT && where.slug !== project.slug) return null;
      if (args && args.select && args.select.ownerId) return { ownerId: project.ownerId };
      return { ...project, sections: [], members: [], tags: [], owner: { id: USER_A, name: 'Owner', avatar: null }, _count: { sections: 1, members: 1 } };
    },
    findMany: async () => [],
  },
  projectMember: {
    findUnique: async () => null,
    findMany: async () => [],
  },
  section: {
    findUnique: async (args) => {
      const where = (args && args.where) || {};
      if (where.id !== SECTION) return null;
      if (args && args.select && args.select.projectId) return { projectId: PROJECT };
      return section;
    },
    findMany: async () => [{ ...section, _count: { tasks: 1 } }],
  },
  sectionMember: {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
  },
  taskAssignee: {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
  },
  task: {
    findUnique: async (args) => {
      const where = (args && args.where) || {};
      if (where.id !== TASK) return null;
      if (args && args.select && args.select.sectionId) {
        return { id: TASK, sectionId: SECTION, section: { projectId: PROJECT } };
      }
      return task;
    },
    findMany: async () => [{
      ...task,
      tags: [],
      assignees: [],
      subtasks: [],
      blockedBy: [],
      blocks: [],
      _count: { comments: 0, subtasks: 0 },
    }],
  },
  user: {
    findUnique: async () => ({ id: USER_A, name: 'Owner', email: 'owner@example.test', avatar: null }),
  },
  comment: { findMany: async () => [] },
  notification: { create: async () => ({}), findMany: async () => [] },
  $queryRaw: async () => [1],
  $transaction: async (callback) => callback(fake),
  $disconnect: async () => {},
};

module.exports = fake;
module.exports.default = fake;
module.exports.__esModule = true;
`;

function readSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const envPath = path.join(backendDir, '.env');
  const source = fs.readFileSync(envPath, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^JWT_SECRET=(.*)$/);
    if (match) return match[1].trim().replace(/^"|"$/g, '');
  }
  throw new Error('JWT_SECRET not found in environment or backend/.env');
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API}/health`);
      if (response.ok) {
        await response.text();
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Server did not become ready on port ' + PORT);
}

async function request(check) {
  // Signed uploads live at the origin root, not under /api.
  const url = check.path.startsWith('/uploads')
    ? `http://127.0.0.1:${PORT}${check.path}`
    : `${API}${check.path}`;
  const response = await fetch(url, {
    method: check.method,
    headers: {
      Authorization: `Bearer ${check.token}`,
      ...(check.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: check.body ? JSON.stringify(check.body) : undefined,
  });
  await response.text();
  return response.status;
}

async function main() {
  if (!fs.existsSync(prismaPath)) {
    throw new Error('dist/lib/prisma.js not found — run `npm run build` first');
  }

  const secret = readSecret();
  if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  fs.copyFileSync(prismaPath, backupPath);
  fs.writeFileSync(prismaPath, FIXTURE_MODULE);

  const tokenA = jwt.sign({ userId: USER_A }, secret, { expiresIn: '10m' });
  const tokenB = jwt.sign({ userId: USER_B }, secret, { expiresIn: '10m' });

  const server = spawn(process.execPath, ['dist/index.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET: secret,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://fixture/fixture',
      CORS_ORIGIN: 'http://localhost:5173',
    },
    stdio: 'ignore',
  });

  const checks = [
    // Positive controls: the owner can read the same resources.
    { label: 'owner lists sections', method: 'GET', path: `/projects/${PROJECT}/sections`, token: tokenA, expected: 200 },
    { label: 'owner lists section tasks', method: 'GET', path: `/sections/${SECTION}/tasks`, token: tokenA, expected: 200 },

    // Project scope.
    { label: 'export', method: 'GET', path: `/projects/${PROJECT}/export`, token: tokenB, expected: 403 },
    { label: 'project sections', method: 'GET', path: `/projects/${PROJECT}/sections`, token: tokenB, expected: 403 },
    { label: 'project members', method: 'GET', path: `/projects/${PROJECT}/members`, token: tokenB, expected: 403 },
    { label: 'project tags', method: 'GET', path: `/projects/${PROJECT}/tags`, token: tokenB, expected: 403 },
    { label: 'create tag', method: 'POST', path: `/projects/${PROJECT}/tags`, token: tokenB, expected: 403, body: { name: 'x' } },
    { label: 'calendar', method: 'GET', path: `/projects/${PROJECT}/calendar?from=2026-01-01&to=2026-12-31`, token: tokenB, expected: 403 },
    { label: 'ai apply', method: 'POST', path: '/ai/apply', token: tokenB, expected: 403, body: { projectId: PROJECT, preview: { sections: [] } } },
    { label: 'ai preview', method: 'POST', path: '/ai/preview', token: tokenB, expected: 403, body: { projectId: PROJECT, markdown: '# hi' } },

    // Section scope.
    { label: 'section tasks', method: 'GET', path: `/sections/${SECTION}/tasks`, token: tokenB, expected: 403 },
    { label: 'section members', method: 'GET', path: `/sections/${SECTION}/members`, token: tokenB, expected: 403 },
    { label: 'update section', method: 'PATCH', path: `/sections/${SECTION}`, token: tokenB, expected: 403, body: { name: 'hacked' } },
    { label: 'archive section', method: 'PATCH', path: `/sections/${SECTION}/archive`, token: tokenB, expected: 403 },
    { label: 'delete section', method: 'DELETE', path: `/sections/${SECTION}`, token: tokenB, expected: 403 },

    // Task scope.
    { label: 'task comments', method: 'GET', path: `/tasks/${TASK}/comments`, token: tokenB, expected: 403 },
    { label: 'create comment', method: 'POST', path: `/tasks/${TASK}/comments`, token: tokenB, expected: 403, body: { content: 'hi' } },
    { label: 'task assignees', method: 'GET', path: `/tasks/${TASK}/assignees`, token: tokenB, expected: 403 },
    { label: 'assign self', method: 'POST', path: `/tasks/${TASK}/assignees`, token: tokenB, expected: 403, body: { email: 'stranger@example.test' } },
    { label: 'task activity', method: 'GET', path: `/tasks/${TASK}/activity`, token: tokenB, expected: 403 },
    { label: 'task attachments', method: 'GET', path: `/tasks/${TASK}/attachments`, token: tokenB, expected: 403 },
    { label: 'task dependencies', method: 'GET', path: `/tasks/${TASK}/dependencies`, token: tokenB, expected: 403 },
    { label: 'update task', method: 'PATCH', path: `/tasks/${TASK}`, token: tokenB, expected: 403, body: { title: 'hacked' } },
    { label: 'move task', method: 'PATCH', path: `/tasks/${TASK}/move`, token: tokenB, expected: 403, body: { status: 'DONE', position: 0 } },
    { label: 'delete task', method: 'DELETE', path: `/tasks/${TASK}`, token: tokenB, expected: 403 },

    // Signed uploads reject a key without a valid signature.
    { label: 'unsigned upload url', method: 'GET', path: '/uploads/does-not-exist.png', token: tokenB, expected: 403 },
  ];

  const results = [];
  try {
    await waitForServer();
    for (const check of checks) {
      const got = await request(check);
      results.push({ ...check, got, ok: got === check.expected });
    }
  } finally {
    server.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    fs.copyFileSync(backupPath, prismaPath);
    fs.unlinkSync(backupPath);
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.label}: expected ${result.expected}, got ${result.got}`);
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} HTTP authorization checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('HTTP authorization test failed:', error.message);
  process.exitCode = 1;
  // Best-effort restore if the fixture was installed.
  try {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, prismaPath);
      fs.unlinkSync(backupPath);
    }
  } catch {
    // ignore
  }
});
