import type { ToolDescription } from './tool.js';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export interface ToolResultMessage {
  readonly toolCallId: string;
  readonly content: string;
}

export interface Message {
  readonly role: MessageRole;
  readonly content: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly toolResults?: readonly ToolResultMessage[];
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export interface LlmResponse {
  readonly content: string;
  readonly stopReason: StopReason;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: TokenUsage;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface StreamEvent {
  readonly type: 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'done';
  readonly content?: string;
  readonly toolCall?: Partial<ToolCall>;
  readonly response?: LlmResponse;
}

export interface ILlmProvider {
  readonly providerId: string;
  chat(messages: readonly Message[], tools?: readonly ToolDescription[]): Promise<LlmResponse>;
  stream(messages: readonly Message[], tools?: readonly ToolDescription[]): AsyncIterable<StreamEvent>;
}
