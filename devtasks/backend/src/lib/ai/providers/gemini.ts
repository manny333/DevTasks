import type { AIProvider, AIConfig, ChatMessage, ChatOptions, ChatResponse } from '../types';

export class GeminiProvider implements AIProvider {
  constructor(private config: AIConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg && contents.length > 0) {
      contents[0].parts.unshift({ text: `[System: ${systemMsg.content}]` });
    }

    const res = await fetch(
      `${this.config.baseUrl}/v1beta/models/${options?.model || this.config.defaultModel}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.3,
            maxOutputTokens: options?.maxTokens ?? 4096,
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data: any = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini');

    return {
      content,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined> {
    const result = await this.chat(messages, options);
    yield result.content;
  }
}
