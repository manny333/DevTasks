import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readKanvyToken, resolveKanvyConfig } from '../lib/config.js';

test('config: defaults', () => {
  const config = resolveKanvyConfig({});
  assert.equal(config.apiUrl, 'http://localhost:5001/api');
  assert.equal(config.allowWrites, true);
  assert.equal(config.timeoutMs, 15000);
});

test('config: strips trailing slashes and parses booleans', () => {
  const config = resolveKanvyConfig({
    apiUrl: 'https://kanvy.example/api/',
    allowWrites: 'false',
    timeoutMs: '9000',
  });
  assert.equal(config.apiUrl, 'https://kanvy.example/api');
  assert.equal(config.allowWrites, false);
  assert.equal(config.timeoutMs, 9000);
});

test('config: rejects invalid apiUrl', () => {
  assert.throws(() => resolveKanvyConfig({ apiUrl: 'nope' }), /valid http/);
  assert.throws(() => resolveKanvyConfig({ apiUrl: 'ftp://x' }), /valid http/);
});

test('config: token precedence and missing token', () => {
  const previous = process.env.KANVY_TOKEN;
  const missing = path.join(os.tmpdir(), 'dsh-kanvy-missing-token-xyz');
  delete process.env.KANVY_TOKEN;

  try {
    assert.throws(() => readKanvyToken(resolveKanvyConfig({}), missing), /no Kanvy token/);
    assert.equal(readKanvyToken(resolveKanvyConfig({ token: ' direct ' }), missing), 'direct');

    process.env.KANVY_TOKEN = ' env-token ';
    assert.equal(readKanvyToken(resolveKanvyConfig({}), missing), 'env-token');
  } finally {
    if (previous === undefined) delete process.env.KANVY_TOKEN;
    else process.env.KANVY_TOKEN = previous;
  }
});

test('config: falls back to the conventional token file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kanvy-'));
  const file = path.join(dir, 'token');
  try {
    fs.writeFileSync(file, 'fallback-token\n', 'utf8');
    assert.equal(readKanvyToken(resolveKanvyConfig({}), file), 'fallback-token');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('config: reads and trims tokenFile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-kanvy-'));
  const file = path.join(dir, 'token');
  try {
    fs.writeFileSync(file, '  file-token\n', 'utf8');
    const config = resolveKanvyConfig({ tokenFile: file });
    assert.equal(config.tokenFile, file);
    assert.equal(readKanvyToken(config), 'file-token');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('config: reports unreadable tokenFile', () => {
  const config = resolveKanvyConfig({ tokenFile: path.join(os.tmpdir(), 'does-not-exist-xyz') });
  assert.throws(() => readKanvyToken(config), /cannot read tokenFile/);
});
