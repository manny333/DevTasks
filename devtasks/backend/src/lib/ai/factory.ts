import type { AIProvider, AIConfig } from './types';
import { DeepSeekProvider } from './providers/deepseek';
import { OpenAIProvider } from './providers/openai';

function buildConfig(provider: string, overrideApiKey?: string, overrideBaseUrl?: string): AIConfig {
  const key = overrideApiKey || process.env[`AI_${provider.toUpperCase()}_API_KEY`];
  const defaults: Record<string, { baseUrl: string; model: string }> = {
    deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' },
    openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
  };
  const def = defaults[provider] || { baseUrl: '', model: '' };
  const baseUrl = overrideBaseUrl || process.env[`AI_${provider.toUpperCase()}_BASE_URL`] || def.baseUrl;
  const model = process.env[`AI_${provider.toUpperCase()}_MODEL`] || def.model;

  if (!key) {
    throw new Error(`AI provider "${provider}" not configured: missing API key`);
  }

  return { apiKey: key, baseUrl, defaultModel: model };
}

export function createProvider(provider: string, apiKey?: string, baseUrl?: string): AIProvider {
  const config = buildConfig(provider, apiKey, baseUrl);
  switch (provider) {
    case 'deepseek': return new DeepSeekProvider(config);
    case 'openai': return new OpenAIProvider(config);
    default: throw new Error(`Unknown AI provider: ${provider}. Supported: deepseek, openai`);
  }
}

export function getAvailableProviders(): { id: string; label: string; model: string; hasKey: boolean }[] {
  const providers: { id: string; label: string; model: string; hasKey: boolean }[] = [];
  for (const id of ['deepseek', 'openai']) {
    const key = process.env[`AI_${id.toUpperCase()}_API_KEY`];
    providers.push({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      model: process.env[`AI_${id.toUpperCase()}_MODEL`] || 'default',
      hasKey: !!key,
    });
  }
  return providers;
}
