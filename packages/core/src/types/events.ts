import type { Message, LlmResponse, ToolCall } from './provider.js';
import type { ToolResult } from './tool.js';
import type { ExecutionResult } from './sandbox.js';

export interface AgentEvents {
  'agent:start': { runId: string; model: string; startedAt: number };
  'agent:end': { runId: string; reason: string; durationMs: number; iterations: number };
  'agent:error': { runId: string; error: Error };
  'llm:request': { runId: string; messages: readonly Message[] };
  'llm:response': { runId: string; response: LlmResponse; durationMs: number; model: string };
  'llm:stream': { runId: string; chunk: string };
  'tool:start': { runId: string; toolCall: ToolCall; startedAt: number };
  'tool:end': { runId: string; toolCall: ToolCall; result: ToolResult; durationMs: number };
  'tool:permission': { runId: string; toolName: string };
  'sandbox:execute': { runId: string; language: string };
  'sandbox:result': { runId: string; result: ExecutionResult };
  'mcp:connected': { server: string; toolCount: number };
  'mcp:disconnected': { server: string };
  'mcp:tools_changed': { server: string; tools: readonly string[] };
  'context:assembled': { runId: string; usage: unknown; wasCompressed: boolean; toolCount: number };
}

export type EventName = keyof AgentEvents;
export type EventPayload<K extends EventName> = AgentEvents[K];
