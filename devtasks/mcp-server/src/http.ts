import http from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import type { Config } from './config.js';
import { createKanvyServer } from './server.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Optional HTTP transport (Streamable HTTP) for clients that cannot spawn a
 * local process. It is loopback-only by default; binding elsewhere requires
 * MCP_HTTP_TOKEN (validated in config.ts).
 */
export async function runHttpServer(config: Config): Promise<void> {
  const handler = createMcpHandler(() => createKanvyServer(config));
  const nodeHandler = toNodeHandler(handler);
  const hostGuard = localhostHostValidation();
  const originGuard = localhostOriginValidation();
  const loopback = LOOPBACK_HOSTS.has(config.httpHost);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', name: 'kanvy-mcp', writes: config.allowWrites }));
      return;
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. MCP endpoint is /mcp' }));
      return;
    }

    if (loopback) {
      if (!hostGuard(req, res)) return;
      if (!originGuard(req, res)) return;
    }

    if (config.httpToken) {
      const expected = `Bearer ${config.httpToken}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    void nodeHandler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.httpPort, config.httpHost, () => resolve());
  });

  console.error(`[kanvy-mcp] HTTP transport listening on http://${config.httpHost}:${config.httpPort}/mcp`);
  if (!loopback) {
    console.error('[kanvy-mcp] Non-loopback bind: use TLS/reverse proxy and keep MCP_HTTP_TOKEN secret.');
  }

  const shutdown = (): void => {
    server.close();
    void handler.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
