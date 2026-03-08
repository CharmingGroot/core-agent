/**
 * Chameleon Agent Framework — TypeScript SDK.
 *
 * Re-exports from internal packages for a single public entry point.
 *
 * Usage:
 *   import { AgentLoop, SubAgentTool, Registry, OpenAIProvider } from 'chameleon-agent';
 */

// Core
export {
  Registry,
  EventBus,
  RunContext,
  createLogger,
  createChildLogger,
  AgentError,
  RegistryError,
  ConfigError,
  ProviderError,
  ToolExecutionError,
  PermissionDeniedError,
  AbortError,
} from '@cli-agent/core';

export type {
  ITool,
  ILlmProvider,
  ToolParameter,
  ToolDescription,
  ToolResult,
  ToolCall,
  Message,
  LlmResponse,
  StreamEvent,
  TokenUsage,
  StopReason,
  JsonValue,
  JsonObject,
  AgentLogger,
  ProviderConfig,
  AgentConfig,
} from '@cli-agent/core';

// Agent
export {
  AgentLoop,
  MessageManager,
  ToolDispatcher,
  PermissionManager,
  SubAgentTool,
  SessionManager,
} from '@cli-agent/agent';

export type {
  AgentLoopOptions,
  AgentResult,
  SystemPromptBuilder,
  SubAgentToolConfig,
  PermissionHandler,
  PermissionDecision,
  SessionMeta,
} from '@cli-agent/agent';

// Providers
export {
  OpenAIProvider,
  ClaudeProvider,
  createProvider,
  RetryProvider,
} from '@cli-agent/providers';

export type { RetryConfig } from '@cli-agent/providers';
