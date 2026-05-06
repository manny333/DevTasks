import type { AIProvider, AIConfig } from './types';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { GeminiProvider } from './providers/gemini';

type ProviderId = 'deepseek' | 'openai' | 'anthropic' | 'gemini';

const PROVIDER_DEFAULTS: Record<ProviderId, { baseUrl: string; model: string; label: string }> = {
  deepseek:  { baseUrl: 'https://api.deepseek.com',  model: 'deepseek-v4-pro',            label: 'DeepSeek' },
  openai:    { baseUrl: 'https://api.openai.com',     model: 'gpt-4o',                     label: 'OpenAI' },
  anthropic: { baseUrl: 'https://api.anthropic.com',  model: 'claude-3-5-sonnet-20241022', label: 'Claude (Anthropic)' },
  gemini:    { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash', label: 'Gemini (Google)' },
};

function buildConfig(provider: string, apiKey: string, baseUrl?: string): AIConfig {
  const def = PROVIDER_DEFAULTS[provider as ProviderId] || { baseUrl: '', model: '' };
  const resolvedBaseUrl = baseUrl || process.env[`AI_${provider.toUpperCase()}_BASE_URL`] || def.baseUrl;
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
  id: string; label: string; model: string; hasKey: boolean; hasUserKey: boolean;
}[] {
  const keyMap = new Map(userKeys?.map(k => [k.provider, k.label]) || []);
  return (Object.keys(PROVIDER_DEFAULTS) as ProviderId[]).map(id => {
    const def = PROVIDER_DEFAULTS[id];
    const envKey = !!process.env[`AI_${id.toUpperCase()}_API_KEY`];
    const userKey = keyMap.has(id);
    return {
      id,
      label: def.label,
      model: process.env[`AI_${id.toUpperCase()}_MODEL`] || def.model,
      hasKey: envKey || userKey,
      hasUserKey: userKey,
    };
  });
}

