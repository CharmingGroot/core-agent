import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './mcp-types.js';

/**
 * Transport layer for MCP communication.
 * Implementations: StdioTransport (child process), SseTransport (HTTP).
 */
export interface IMcpTransport {
  /** Send a JSON-RPC request and wait for response */
  send(request: JsonRpcRequest): Promise<JsonRpcResponse>;

  /** Send a notification (no response expected) */
  notify(notification: JsonRpcNotification): Promise<void>;

  /** Register handler for server-initiated notifications */
  onNotification(handler: (notification: JsonRpcNotification) => void): void;

  /** Close the transport connection */
  close(): Promise<void>;

  /** Whether the transport is currently connected */
  readonly connected: boolean;
}
