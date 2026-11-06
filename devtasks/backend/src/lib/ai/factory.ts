import type { AIProvider, AIConfig } from './types';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';

type ProviderId = 'deepseek' | 'openai' | 'anthropic' | 'gemini';

const PROVIDER_DEFAULTS: Record<ProviderId, { baseUrl: string; model: string; models: string[]; label: string }> = {
  deepseek:  { baseUrl: 'https://api.deepseek.com',  model: 'deepseek-v4-pro', models: ['deepseek-flash', 'deepseek-v4-pro'], label: 'DeepSeek' },
  openai:    { baseUrl: 'https://api.openai.com',     model: 'gpt-4o',                     models: ['gpt-4o'], label: 'OpenAI' },
  anthropic: { baseUrl: 'https://api.anthropic.com',  model: 'claude-3-5-sonnet-20241022', models: ['claude-3-5-sonnet-20241022'], label: 'Claude (Anthropic)' },
  gemini:    { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash', models: ['gemini-2.0-flash'], label: 'Gemini (Google)' },
};

/** Hosts the server may talk to when no explicit allowlist is configured. */
const ALLOWED_HOSTS: Record<ProviderId, string[]> = {
  deepseek: ['api.deepseek.com'],
  openai: ['api.openai.com'],
  anthropic: ['api.anthropic.com'],
  gemini: ['generativelanguage.googleapis.com'],
};

/**
 * Validates a base URL before it is used for a server-side fetch.
 * This is the SSRF guard: a client-supplied `baseUrl` must resolve to a known
 * provider host, or match `AI_ALLOWED_BASE_URLS` (comma-separated prefixes)
 * when using a self-hosted gateway.
 */
function assertSafeBaseUrl(provider: string, baseUrl: string): string {
  if (!baseUrl) throw new Error(`No baseUrl configured for provider "${provider}"`);

  const allowlist = (process.env.AI_ALLOWED_BASE_URLS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowlist.length > 0) {
    const normalized = baseUrl.replace(/\/+$/, '');
    const allowed = allowlist.some((entry) => {
      const candidate = entry.replace(/\/+$/, '');
      return normalized === candidate || normalized.startsWith(`${candidate}/`);
    });
    if (!allowed) throw new Error('baseUrl is not allowed by AI_ALLOWED_BASE_URLS');
    return normalized;
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Invalid baseUrl');
  }
  if (parsed.protocol !== 'https:') throw new Error('baseUrl must use https');
  const hosts = ALLOWED_HOSTS[provider as ProviderId] ?? [];
  if (!hosts.includes(parsed.hostname)) {
    throw new Error(`${provider} provider does not allow baseUrl host ${parsed.hostname}`);
  }
  return baseUrl.replace(/\/+$/, '');
}

function buildConfig(provider: string, apiKey: string, baseUrl?: string): AIConfig {
  const def = PROVIDER_DEFAULTS[provider as ProviderId] || { baseUrl: '', model: '' };
  const rawBaseUrl = baseUrl || process.env[`AI_${provider.toUpperCase()}_BASE_URL`] || def.baseUrl;
  const resolvedBaseUrl = assertSafeBaseUrl(provider, rawBaseUrl);
  const model = process.env[`AI_${provider.toUpperCase()}_MODEL`] || def.model;
  return { apiKey, baseUrl: resolvedBaseUrl, defaultModel: model };
}

export function createProvider(provider: string, apiKey: string, baseUrl?: string): AIProvider {
  if (!apiKey) throw new Error(`API key required for provider "${provider}"`);
  const config = buildConfig(provider, apiKey, baseUrl);
  switch (provider) {
    case 'deepseek':  return new DeepSeekProvider(config);
    case 'openai':    return new OpenAIProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
    case 'gemini':    return new GeminiProvider(config);
    default: throw new Error(`Unknown AI provider: ${provider}. Supported: ${Object.keys(PROVIDER_DEFAULTS).join(', ')}`);
  }
}

export function getAvailableProviders(userKeys?: { provider: string; label?: string | null }[]): {
  id: string; label: string; model: string; models: string[]; hasKey: boolean; hasUserKey: boolean;
}[] {
  const keyMap = new Map(userKeys?.map(k => [k.provider, k.label]) || []);
  return (Object.keys(PROVIDER_DEFAULTS) as ProviderId[]).map(id => {
    const def = PROVIDER_DEFAULTS[id];
    const envKey = !!process.env[`AI_${id.toUpperCase()}_API_KEY`];
    const userKey = keyMap.has(id);
    const envModel = process.env[`AI_${id.toUpperCase()}_MODEL`];
    const models = [...new Set([envModel, ...def.models].filter((model): model is string => Boolean(model)))];
    return {
      id,
      label: def.label,
      model: envModel || def.model,
      models,
      hasKey: envKey || userKey,
      hasUserKey: userKey,
    };
  });
}
