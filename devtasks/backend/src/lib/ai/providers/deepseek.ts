import { requestSignal } from '../abort';
import type { AIProvider, AIConfig, ChatMessage, ChatOptions, ChatResponse } from '../types';

export class DeepSeekProvider implements AIProvider {
  constructor(private config: AIConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || this.config.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        reasoning_effort: options?.effort,
      }),
      signal: requestSignal(120_000, options?.signal),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error(`DeepSeek returned empty response. Finish reason: ${choice?.finish_reason || 'none'}`);
    }

    const usage = data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined;
    if (usage) options?.onUsage?.(usage);
    if (choice.finish_reason) options?.onFinish?.(choice.finish_reason);

    return { content: choice.message.content, usage, finishReason: choice.finish_reason };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined> {
    const res = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model || this.config.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 4096,
        response_format: options?.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
        reasoning_effort: options?.effort,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: requestSignal(300_000, options?.signal),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          if (json.usage) {
            options?.onUsage?.({
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
            });
          }
          const finishReason = json.choices?.[0]?.finish_reason;
          if (finishReason) options?.onFinish?.(finishReason);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* skip malformed chunks */ }
      }
    }
  }
}
