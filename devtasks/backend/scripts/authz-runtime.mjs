/**
 * Runtime authorization test.
 *
 * Requires a running API (`npm start` / `node dist/index.js`) and a reachable
 * database. Creates two users and a project owned by A, then checks that B
 * (with no grant) gets 403 from every project-scoped endpoint. Cleans up after
 * itself.
 *
 * Usage: npm run test:runtime
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import prismaModule from '../dist/lib/prisma.js';

const prisma = prismaModule.default ?? prismaModule;

const PORT = process.env.PORT || 5001;
const API = process.env.API_URL || `http://localhost:${PORT}/api`;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error('JWT_SECRET is required (backend/.env)');
  process.exit(1);
}

const results = [];

async function request(check) {
  const response = await fetch(`${API}${check.path}`, {
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
  const suffix = Date.now();
  const userA = await prisma.user.create({
    data: { email: `authz-a-${suffix}@kanvy.local`, name: 'Authz A', googleId: `authz-a-${suffix}` },
  });
  const userB = await prisma.user.create({
    data: { email: `authz-b-${suffix}@kanvy.local`, name: 'Authz B', googleId: `authz-b-${suffix}` },
  });

  const project = await prisma.project.create({
    data: {
      name: `Authz runtime ${suffix}`,
      slug: `authz-runtime-${suffix}`,
      ownerId: userA.id,
      members: { create: { userId: userA.id, role: 'OWNER' } },
      sections: {
        create: [
          {
            name: 'Section A',
            position: 0,
            tasks: { create: [{ title: 'Owned task', status: 'TODO', position: 0 }] },
          },
        ],
      },
    },
    include: { sections: { include: { tasks: true } } },
  });

  const section = project.sections[0];
  const task = section.tasks[0];
  const tokenA = jwt.sign({ userId: userA.id }, SECRET, { expiresIn: '10m' });
  const tokenB = jwt.sign({ userId: userB.id }, SECRET, { expiresIn: '10m' });

  const tagPath = `/projects/${project.id}/tags`;
  const checks = [
    { label: 'owner lists sections', method: 'GET', path: `/projects/${project.id}/sections`, token: tokenA, expected: 200 },
    { label: 'owner lists section tasks', method: 'GET', path: `/sections/${section.id}/tasks`, token: tokenA, expected: 200 },

    { label: 'export', method: 'GET', path: `/projects/${project.id}/export`, token: tokenB, expected: 403 },
    { label: 'project sections', method: 'GET', path: `/projects/${project.id}/sections`, token: tokenB, expected: 403 },
    { label: 'project members', method: 'GET', path: `/projects/${project.id}/members`, token: tokenB, expected: 403 },
    { label: 'project tags', method: 'GET', path: tagPath, token: tokenB, expected: 403 },
    { label: 'create tag', method: 'POST', path: tagPath, token: tokenB, expected: 403, body: { name: 'x' } },
    { label: 'calendar', method: 'GET', path: `/projects/${project.id}/calendar?from=2026-01-01&to=2026-12-31`, token: tokenB, expected: 403 },
    { label: 'ai apply', method: 'POST', path: '/ai/apply', token: tokenB, expected: 403, body: { projectId: project.id, preview: { sections: [] } } },
    { label: 'ai preview', method: 'POST', path: '/ai/preview', token: tokenB, expected: 403, body: { projectId: project.id, markdown: '# hi' } },

    { label: 'section tasks', method: 'GET', path: `/sections/${section.id}/tasks`, token: tokenB, expected: 403 },
    { label: 'section members', method: 'GET', path: `/sections/${section.id}/members`, token: tokenB, expected: 403 },
    { label: 'update section', method: 'PATCH', path: `/sections/${section.id}`, token: tokenB, expected: 403, body: { name: 'hacked' } },
    { label: 'archive section', method: 'PATCH', path: `/sections/${section.id}/archive`, token: tokenB, expected: 403 },
    { label: 'delete section', method: 'DELETE', path: `/sections/${section.id}`, token: tokenB, expected: 403 },

    { label: 'task comments', method: 'GET', path: `/tasks/${task.id}/comments`, token: tokenB, expected: 403 },
    { label: 'create comment', method: 'POST', path: `/tasks/${task.id}/comments`, token: tokenB, expected: 403, body: { content: 'hi' } },
    { label: 'task assignees', method: 'GET', path: `/tasks/${task.id}/assignees`, token: tokenB, expected: 403 },
    { label: 'assign self', method: 'POST', path: `/tasks/${task.id}/assignees`, token: tokenB, expected: 403, body: { email: userB.email } },
    { label: 'task activity', method: 'GET', path: `/tasks/${task.id}/activity`, token: tokenB, expected: 403 },
    { label: 'task attachments', method: 'GET', path: `/tasks/${task.id}/attachments`, token: tokenB, expected: 403 },
    { label: 'task dependencies', method: 'GET', path: `/tasks/${task.id}/dependencies`, token: tokenB, expected: 403 },
    { label: 'update task', method: 'PATCH', path: `/tasks/${task.id}`, token: tokenB, expected: 403, body: { title: 'hacked' } },
    { label: 'move task', method: 'PATCH', path: `/tasks/${task.id}/move`, token: tokenB, expected: 403, body: { status: 'DONE', position: 0 } },
    { label: 'delete task', method: 'DELETE', path: `/tasks/${task.id}`, token: tokenB, expected: 403 },

    { label: 'unsigned upload url', method: 'GET', path: '/uploads/does-not-exist.png', token: tokenB, expected: 403, absolute: true },
  ];

  try {
    for (const check of checks) {
      const url = check.absolute
        ? `http://localhost:${PORT}${check.path}`
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
      results.push({ label: check.label, expected: check.expected, got: response.status });
    }
  } finally {
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }

  for (const result of results) {
    const ok = result.got === result.expected;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${result.label}: expected ${result.expected}, got ${result.got}`);
  }
  const failed = results.filter((result) => result.got !== result.expected);
  console.log(`\n${results.length - failed.length}/${results.length} runtime authorization checks passed.`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Runtime authz test failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
