import type { AIProvider, AIConfig, ChatMessage, ChatOptions, ChatResponse } from '../types';

export class OpenAIProvider implements AIProvider {
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
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      throw new Error('Empty response from OpenAI');
    }

    return {
      content: choice.message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}
