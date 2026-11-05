import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../build/config.js';

test('config: sensible defaults', () => {
  const config = loadConfig({ KANVY_TOKEN: 'token' });
  assert.equal(config.apiUrl, 'http://localhost:5001/api');
  assert.equal(config.allowWrites, true);
  assert.equal(config.transport, 'stdio');
  assert.equal(config.httpHost, '127.0.0.1');
  assert.equal(config.httpPort, 3333);
  assert.equal(config.requestTimeoutMs, 15000);
});

test('config: strips trailing slashes from the API URL', () => {
  const config = loadConfig({ KANVY_TOKEN: 'token', KANVY_API_URL: 'https://kanvy.example/api/' });
  assert.equal(config.apiUrl, 'https://kanvy.example/api');
});

test('config: parses boolean flags', () => {
  assert.equal(loadConfig({ KANVY_TOKEN: 't', KANVY_ALLOW_WRITES: '0' }).allowWrites, false);
  assert.equal(loadConfig({ KANVY_TOKEN: 't', KANVY_ALLOW_WRITES: 'false' }).allowWrites, false);
  assert.equal(loadConfig({ KANVY_TOKEN: 't', KANVY_ALLOW_WRITES: 'yes' }).allowWrites, true);
});

test('config: requires a token', () => {
  assert.throws(() => loadConfig({}), /KANVY_TOKEN/);
});

test('config: rejects invalid API URLs', () => {
  assert.throws(
    () => loadConfig({ KANVY_TOKEN: 't', KANVY_API_URL: 'not-a-url' }),
    /KANVY_API_URL/
  );
  assert.throws(
    () => loadConfig({ KANVY_TOKEN: 't', KANVY_API_URL: 'ftp://example.com/api' }),
    /KANVY_API_URL/
  );
});

test('config: non-loopback HTTP requires MCP_HTTP_TOKEN', () => {
  assert.throws(
    () =>
      loadConfig({
        KANVY_TOKEN: 't',
        MCP_TRANSPORT: 'http',
        MCP_HTTP_HOST: '0.0.0.0',
      }),
    /MCP_HTTP_TOKEN/
  );

  const config = loadConfig({
    KANVY_TOKEN: 't',
    MCP_TRANSPORT: 'http',
    MCP_HTTP_HOST: '0.0.0.0',
    MCP_HTTP_TOKEN: 'http-secret',
  });
  assert.equal(config.httpToken, 'http-secret');
});

test('config: loopback HTTP does not require a token', () => {
  const config = loadConfig({ KANVY_TOKEN: 't', MCP_TRANSPORT: 'http' });
  assert.equal(config.transport, 'http');
  assert.equal(config.httpToken, undefined);
});
