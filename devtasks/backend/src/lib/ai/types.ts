export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
}

export interface ChatResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
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
}

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}
