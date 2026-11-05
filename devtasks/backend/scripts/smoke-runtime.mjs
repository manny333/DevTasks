/**
 * End-to-end smoke test for the security-sensitive flows:
 *   - signed upload URLs (valid signature serves, unsigned 403)
 *   - magic-byte validation (HTML disguised as PNG rejected)
 *   - one-time SSE ticket (reuse 401)
 *
 * Requires the API running (`node dist/index.js`) and a reachable database.
 * Creates an isolated user/project and removes it afterwards.
 *
 * Usage: npm run smoke:runtime
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Client } = pg;
const PORT = process.env.PORT || 5001;
const ORIGIN = `http://localhost:${PORT}`;
const API = `${ORIGIN}/api`;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error('JWT_SECRET is required (backend/.env)');
  process.exit(1);
}

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
}

async function jsonRequest(path, token, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data, headers: response.headers };
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const suffix = Date.now();
const userId = crypto.randomUUID();
const email = `smoke-${suffix}@kanvy.local`;

let projectId = null;
let attachmentId = null;

try {
  await client.query(
    'INSERT INTO "User"(id, name, email, "googleId") VALUES ($1, $2, $3, $4)',
    [userId, 'Smoke User', email, `smoke-${suffix}`]
  );
  const token = jwt.sign({ userId }, SECRET, { expiresIn: '10m' });

  const project = await jsonRequest('/projects', token, {
    method: 'POST',
    body: JSON.stringify({ name: `Smoke ${suffix}` }),
  });
  check('create project', project.status === 201, `status ${project.status}`);
  projectId = project.data?.id;

  const section = await jsonRequest(`/projects/${projectId}/sections`, token, {
    method: 'POST',
    body: JSON.stringify({ name: 'Smoke section' }),
  });
  check('create section', section.status === 201, `status ${section.status}`);

  const task = await jsonRequest(`/sections/${section.data?.id}/tasks`, token, {
    method: 'POST',
    body: JSON.stringify({ title: 'Smoke task' }),
  });
  check('create task', task.status === 201, `status ${task.status}`);
  const taskId = task.data?.id;

  // 1. Valid PNG upload
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 0),
  ]);
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  const upload = await fetch(`${API}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const uploadBody = await upload.json().catch(() => ({}));
  check('upload PNG', upload.status === 201, `status ${upload.status}`);
  attachmentId = uploadBody.id;

  const signedUrl = uploadBody.url;
  check('upload returns signed url', typeof signedUrl === 'string' && signedUrl.includes('sig='), signedUrl ? 'has sig' : 'missing');

  const signed = await fetch(`${ORIGIN}${signedUrl}`);
  check('signed url serves file', signed.status === 200, `status ${signed.status}`);
  check(
    'file is served as attachment',
    (signed.headers.get('content-disposition') || '').includes('attachment'),
    signed.headers.get('content-disposition') || 'none'
  );
  await signed.text();

  const unsigned = await fetch(`${ORIGIN}${signedUrl.split('?')[0]}`);
  check('unsigned url is rejected', unsigned.status === 403, `status ${unsigned.status}`);
  await unsigned.text();

  // 2. HTML disguised as PNG must fail the magic-byte check
  const evil = new FormData();
  evil.append('file', new Blob([Buffer.from('<html><script>alert(1)</script></html>')], { type: 'image/png' }), 'evil.html');
  const evilUpload = await fetch(`${API}/tasks/${taskId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: evil,
  });
  await evilUpload.text();
  check('disguised HTML is rejected', evilUpload.status === 400, `status ${evilUpload.status}`);

  // 3. One-time SSE ticket
  const ticketResponse = await jsonRequest('/notifications/stream-ticket', token, { method: 'POST' });
  check('issue SSE ticket', ticketResponse.status === 200 && typeof ticketResponse.data?.ticket === 'string', `status ${ticketResponse.status}`);
  const ticket = ticketResponse.data?.ticket;

  const controller = new AbortController();
  const stream = await fetch(`${API}/notifications/stream?ticket=${encodeURIComponent(ticket)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  });
  const reader = stream.body?.getReader();
  await reader?.read();
  controller.abort();
  check('SSE stream accepts ticket', stream.status === 200, `status ${stream.status}`);

  const replay = await fetch(`${API}/notifications/stream?ticket=${encodeURIComponent(ticket)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await replay.text();
  check('SSE ticket is single-use', replay.status === 401, `status ${replay.status}`);

  // 4. Deleting the attachment removes the file
  const deleted = await jsonRequest(`/tasks/${taskId}/attachments/${attachmentId}`, token, { method: 'DELETE' });
  check('delete attachment', deleted.status === 204, `status ${deleted.status}`);
  attachmentId = null;

  const gone = await fetch(`${ORIGIN}${signedUrl}`);
  await gone.text();
  check('deleted file no longer served', gone.status === 404, `status ${gone.status}`);
} finally {
  if (projectId) {
    const removed = await jsonRequest(`/projects/${projectId}`, tokenFromUser(userId), { method: 'DELETE' }).catch(() => null);
    if (!removed || removed.status !== 200) {
      await client.query('DELETE FROM "Project" WHERE id = $1', [projectId]).catch(() => {});
    }
  }
  await client.query('DELETE FROM "User" WHERE id = $1', [userId]);
  await client.end();
}

function tokenFromUser(id) {
  return jwt.sign({ userId: id }, SECRET, { expiresIn: '10m' });
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed.`);
if (failed.length > 0) process.exitCode = 1;
