import type { AIProvider, AIConfig, ChatMessage, ChatOptions, ChatResponse } from '../types';

export class AnthropicProvider implements AIProvider {
  constructor(private config: AIConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // Extract system message (Anthropic has a separate system param)
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    const body: any = {
      model: options?.model || this.config.defaultModel,
      max_tokens: options?.maxTokens ?? 4096,
      messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    };

    if (systemMsg) body.system = systemMsg.content;
    if (options?.temperature !== undefined) body.temperature = options.temperature;

    const res = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    const content = data.content?.[0]?.text;
    if (!content) throw new Error('Empty response from Anthropic');

    return {
      content,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      } : undefined,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined> {
    const result = await this.chat(messages, options);
    yield result.content;
  }
}
