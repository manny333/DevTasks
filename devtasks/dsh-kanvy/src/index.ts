import { readKanvyToken, resolveKanvyConfig } from './config.js';
import { KanvyClient } from './core/client.js';
import { createKanvyTools } from './tools.js';

export const name = 'dsh-kanvy';
export const inject = ['tools'];

interface ToolHost {
  effect(callback: () => () => void): void;
  tools: {
    register(tool: unknown): () => void;
  };
}

/**
 * Registers the native Kanvy tools in the DSH tool registry.
 *
 * Configuration (profile `cordis.patch.yml`):
 *   apiUrl: http://localhost:5001/api
 *   token: ... | tokenFile: ~/.dsh/storages/kanvy/token
 *   allowWrites: true
 *   timeoutMs: 15000
 */
export function apply(ctx: ToolHost, config: unknown = {}): void {
  const resolved = resolveKanvyConfig(config);
  const client = new KanvyClient({
    apiUrl: resolved.apiUrl,
    token: () => readKanvyToken(resolved),
    timeoutMs: resolved.timeoutMs,
  });

  const tools = createKanvyTools(client, {
    allowWrites: resolved.allowWrites,
    timeoutMs: resolved.timeoutMs + 5000,
  });

  for (const tool of tools) {
    ctx.effect(() => ctx.tools.register(tool));
  }
}
