#!/usr/bin/env node
/**
 * Stdio wrapper for Claude Code and other MCP clients.
 *
 * Resolves the Kanvy token without asking the user to paste it:
 *   1. KANVY_TOKEN (explicit override)
 *   2. KANVY_TOKEN_FILE
 *   3. ~/.dsh/storages/kanvy/token (local DSH install)
 *   4. ~/.kanvy/token
 *
 * The wrapper then spawns the real server with inherited stdio, so the MCP
 * JSON-RPC stream is untouched.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const serverEntry = path.join(root, 'build', 'index.js');

function readTokenFile(file) {
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

const tokenFiles = [
  process.env.KANVY_TOKEN_FILE,
  path.join(os.homedir(), '.dsh', 'storages', 'kanvy', 'token'),
  path.join(os.homedir(), '.kanvy', 'token'),
].filter((value) => typeof value === 'string' && value.length > 0);

let token = process.env.KANVY_TOKEN?.trim();
if (!token) {
  for (const file of tokenFiles) {
    token = readTokenFile(file);
    if (token) break;
  }
}

if (!token) {
  console.error(
    '[kanvy-mcp] No Kanvy token found. Set KANVY_TOKEN, write it to ' +
    `${tokenFiles[tokenFiles.length - 1] ?? '~/.kanvy/token'}, or use KANVY_TOKEN_FILE.`
  );
  process.exit(1);
}

const env = {
  ...process.env,
  KANVY_TOKEN: token,
  KANVY_API_URL: process.env.KANVY_API_URL || 'http://localhost:5001/api',
  KANVY_ALLOW_WRITES: process.env.KANVY_ALLOW_WRITES ?? '1',
};

const child = spawn(process.execPath, [serverEntry], { stdio: 'inherit', env });

child.on('error', (error) => {
  console.error(`[kanvy-mcp] Could not start the server: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
