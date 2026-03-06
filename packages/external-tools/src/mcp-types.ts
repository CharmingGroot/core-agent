/**
 * MCP (Model Context Protocol) type definitions.
 * Based on JSON-RPC 2.0 transport.
 */

/** JSON-RPC 2.0 request */
export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response */
export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number | string | null;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

/** JSON-RPC 2.0 error object */
export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** JSON-RPC 2.0 notification (no id) */
export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** MCP server capabilities returned during initialize */
export interface McpServerCapabilities {
  readonly tools?: { listChanged?: boolean };
  readonly resources?: { subscribe?: boolean; listChanged?: boolean };
  readonly prompts?: { listChanged?: boolean };
}

/** MCP initialize result */
export interface McpInitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: McpServerCapabilities;
  readonly serverInfo: {
    readonly name: string;
    readonly version: string;
  };
}

/** MCP tool definition from tools/list */
export interface McpToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: McpToolInputSchema;
}

/** JSON Schema subset for MCP tool input */
export interface McpToolInputSchema {
  readonly type: 'object';
  readonly properties?: Record<string, McpPropertySchema>;
  readonly required?: readonly string[];
}

/** Single property schema */
export interface McpPropertySchema {
  readonly type: string;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly default?: unknown;
}

/** MCP tools/list result */
export interface McpToolListResult {
  readonly tools: readonly McpToolDefinition[];
}

/** MCP tools/call result */
export interface McpToolCallResult {
  readonly content: readonly McpContent[];
  readonly isError?: boolean;
}

/** MCP content block */
export interface McpContent {
  readonly type: 'text' | 'image' | 'resource';
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

/** MCP server connection config */
export interface McpServerConfig {
  readonly name: string;
  readonly transport: 'stdio' | 'sse';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
  readonly url?: string;
  readonly headers?: Record<string, string>;
}

/** MCP connection state */
export type McpConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'error';
