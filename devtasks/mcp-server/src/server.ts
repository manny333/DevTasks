import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import { KanvyClient } from './kanvyClient.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { createToolHandlers, registerTools } from './tools.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

/** Builds a fully wired MCP server instance (one per connection/request). */
export function createKanvyServer(config: Config): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const client = new KanvyClient({
    apiUrl: config.apiUrl,
    token: config.token,
    timeoutMs: config.requestTimeoutMs,
  });

  registerTools(server, createToolHandlers(client, { allowWrites: config.allowWrites }));
  registerResources(server, client);
  registerPrompts(server);

  return server;
}
