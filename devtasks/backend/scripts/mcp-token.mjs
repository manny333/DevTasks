/**
 * Local developer helper: creates a long-lived Kanvy JWT for MCP clients and
 * writes it to the conventional token file. Never prints the token.
 *
 * Usage (from devtasks/backend):
 *   npm run mcp:token -- emhernandez@sismex.com
 *   KANVY_TOKEN_DAYS=90 npm run mcp:token -- user@example.com
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const email = process.argv[2] || process.env.KANVY_EMAIL;
if (!email) {
  console.error('Usage: npm run mcp:token -- <user-email>');
  process.exit(1);
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not configured in devtasks/backend/.env');
  process.exit(1);
}

const days = Math.min(Math.max(Number(process.env.KANVY_TOKEN_DAYS) || 90, 1), 365);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const user = (await client.query('select id, email from "User" where email = $1', [email])).rows[0];
await client.end();

if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const signingInput = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
  userId: user.id,
  iat: now,
  exp: now + days * 86400,
})}`;
const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
const token = `${signingInput}.${signature}`;

const tokenDir = path.join(os.homedir(), '.dsh', 'storages', 'kanvy');
fs.mkdirSync(tokenDir, { recursive: true });
const tokenFile = path.join(tokenDir, 'token');
fs.writeFileSync(tokenFile, token, { encoding: 'utf8', mode: 0o600 });

const expires = new Date((now + days * 86400) * 1000).toISOString().slice(0, 10);
console.log(`Token created for ${user.email}`);
console.log(`Written to ${tokenFile}`);
console.log(`Expires ${expires} (${days} days)`);
