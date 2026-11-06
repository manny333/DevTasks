export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
  /** Aborts the upstream request when the client disconnects. */
  signal?: AbortSignal;
  /** DeepSeek V4 reasoning effort; ignored by providers without this knob. */
  effort?: 'low' | 'high' | 'max';
  /** Reports provider usage, including for streaming responses. */
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
  /** Reports the provider finish reason (e.g. "length" when truncated). */
  onFinish?: (reason: string | undefined) => void;
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
  finishReason?: string;
}

export interface AIProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined>;
}

export interface AIImportSubtask {
  title: string;
}

export interface AIImportTag {
  name: string;
  color?: string;
  action?: 'create' | 'reuse';
  existingId?: string;
}

export interface AIImportAssignee {
  email: string;
  name?: string;
  found?: boolean;
  userId?: string;
}

export interface AIImportTask {
  tempId: string;
  title: string;
  description?: string;
  section: string;
  tags: AIImportTag[];
  assignees: AIImportAssignee[];
  subtasks: AIImportSubtask[];
  startDate?: string;
  dueDate?: string;
  selected: boolean;
}

export interface AIImportSection {
  tempId: string;
  name: string;
  description?: string;
  action: 'create' | 'reuse';
  existingSectionId?: string;
  color?: string;
  tasks: AIImportTask[];
  selected: boolean;
}

export interface AIImportPreview {
  sections: AIImportSection[];
  projectName?: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}
