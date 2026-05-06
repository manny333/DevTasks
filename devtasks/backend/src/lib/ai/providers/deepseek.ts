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
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek API error ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    console.log('[DeepSeek] Response:', JSON.stringify({ model: data.model, usage: data.usage, contentLen: data.choices?.[0]?.message?.content?.length }).slice(0, 300));

    const choice = data.choices?.[0];
    if (!choice?.message?.content) {
      console.error('[DeepSeek] Empty response. Full data:', JSON.stringify(data).slice(0, 500));
      throw new Error(`DeepSeek returned empty response. Finish reason: ${choice?.finish_reason || 'none'}. Raw: ${JSON.stringify(choice).slice(0, 300)}`);
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
