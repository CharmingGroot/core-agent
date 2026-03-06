export type MessageRole = 'user' | 'assistant' | 'system';

export interface ToolCallDisplay {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
  readonly status: 'running' | 'success' | 'error';
  readonly result?: string;
  readonly error?: string;
  readonly durationMs?: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: Date;
  readonly toolCalls?: readonly ToolCallDisplay[];
  readonly iterations?: number;
  readonly tokenUsage?: { input: number; output: number };
}

export interface AppConfig {
  providerId: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
  workingDirectory: string;
}

export type AppView = 'chat' | 'settings';
