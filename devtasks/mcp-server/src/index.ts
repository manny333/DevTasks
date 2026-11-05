#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig } from './config.js';
import { runHttpServer } from './http.js';
import { createKanvyServer } from './server.js';

const USAGE = `kanvy-mcp ${'1.0.0'} — MCP server for Kanvy

Usage:
  kanvy-mcp                 Start over stdio (default)
  kanvy-mcp --help          Show this help

Environment:
  KANVY_API_URL             Kanvy API base URL (default http://localhost:5001/api)
  KANVY_TOKEN               API token (JWT) — required
  KANVY_ALLOW_WRITES        1/0 — enable create_task and add_comment (default 1)
  KANVY_TIMEOUT_MS          Request timeout in ms (default 15000)
  MCP_TRANSPORT             stdio | http (default stdio)
  MCP_HTTP_HOST             Bind host for HTTP (default 127.0.0.1)
  MCP_HTTP_PORT             Bind port for HTTP (default 3333)
  MCP_HTTP_TOKEN            Required bearer token when not binding loopback
`;

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE);
    return;
  }

  const config = loadConfig();

  if (config.transport === 'http') {
    await runHttpServer(config);
    return;
  }

  const handle = serveStdio(() => createKanvyServer(config), {
    onerror: (error) => console.error('[kanvy-mcp]', error),
  });
  console.error(`[kanvy-mcp] stdio ready (writes ${config.allowWrites ? 'enabled' : 'disabled'})`);

  const shutdown = (): void => {
    void handle.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[kanvy-mcp] ${message}`);
  process.exit(1);
});
