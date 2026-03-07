import type { Message, LlmResponse, ToolCall } from './provider.js';
import type { ToolResult } from './tool.js';
import type { ExecutionResult } from './sandbox.js';

export interface AgentEvents {
  'agent:start': { runId: string };
  'agent:end': { runId: string; reason: string };
  'agent:error': { runId: string; error: Error };
  'llm:request': { runId: string; messages: readonly Message[] };
  'llm:response': { runId: string; response: LlmResponse };
  'llm:stream': { runId: string; chunk: string };
  'tool:start': { runId: string; toolCall: ToolCall };
  'tool:end': { runId: string; toolCall: ToolCall; result: ToolResult };
  'tool:permission': { runId: string; toolName: string };
  'sandbox:execute': { runId: string; language: string };
  'sandbox:result': { runId: string; result: ExecutionResult };
  'mcp:connected': { server: string; toolCount: number };
  'mcp:disconnected': { server: string };
  'mcp:tools_changed': { server: string; tools: readonly string[] };
}

export type EventName = keyof AgentEvents;
export type EventPayload<K extends EventName> = AgentEvents[K];
