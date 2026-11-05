import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface KanvyPluginConfig {
  apiUrl?: unknown;
  token?: unknown;
  tokenFile?: unknown;
  allowWrites?: unknown;
  timeoutMs?: unknown;
}

export interface ResolvedKanvyConfig {
  apiUrl: string;
  token?: string;
  tokenFile?: string;
  allowWrites: boolean;
  timeoutMs: number;
}

const DEFAULT_API_URL = 'http://localhost:5001/api';
const DEFAULT_TIMEOUT_MS = 15000;

/** Conventional token location used by the local install. */
export const DEFAULT_TOKEN_FILE = path.join(os.homedir(), '.dsh', 'storages', 'kanvy', 'token');


function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
    if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function expandHome(filePath: string): string {
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export function resolveKanvyConfig(raw: unknown): ResolvedKanvyConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as KanvyPluginConfig;

  const apiUrl = (asString(input.apiUrl) ?? DEFAULT_API_URL).replace(/\/+$/, '');
  try {
    const parsed = new URL(apiUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error(`dsh-kanvy: apiUrl must be a valid http(s) URL, got "${String(input.apiUrl)}"`);
  }

  const timeoutValue = typeof input.timeoutMs === 'number' ? input.timeoutMs : Number(input.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutValue)
    ? Math.min(Math.max(Math.trunc(timeoutValue), 1000), 120000)
    : DEFAULT_TIMEOUT_MS;

  const tokenFile = asString(input.tokenFile);

  return {
    apiUrl,
    token: asString(input.token),
    tokenFile: tokenFile ? expandHome(tokenFile) : undefined,
    allowWrites: asBoolean(input.allowWrites, true),
    timeoutMs,
  };
}

/**
 * Resolves the Kanvy token on every call so a rotated token file takes effect
 * without reloading the plugin.
 */
export function readKanvyToken(
  config: ResolvedKanvyConfig,
  fallbackTokenFile: string | undefined = DEFAULT_TOKEN_FILE
): string {
  if (config.token) return config.token;

  const tokenFile = config.tokenFile ?? fallbackTokenFile;
  if (tokenFile) {
    try {
      const value = fs.readFileSync(tokenFile, 'utf8').trim();
      if (value.length > 0) return value;
      throw new Error('the file is empty');
    } catch (error) {
      if (config.tokenFile) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`dsh-kanvy: cannot read tokenFile "${config.tokenFile}": ${reason}`);
      }
      // The conventional file is optional; fall through to env/error.
    }
  }

  const envToken = process.env.KANVY_TOKEN?.trim();
  if (envToken) return envToken;

  throw new Error(
    'dsh-kanvy: no Kanvy token configured. Set config.token, config.tokenFile, KANVY_TOKEN, '
    + `or write the token to ${DEFAULT_TOKEN_FILE}.`
  );
}
