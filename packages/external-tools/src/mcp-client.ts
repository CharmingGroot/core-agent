import { createChildLogger } from '@cli-agent/core';
import type { IMcpTransport } from './mcp-transport.js';
import type {
  McpInitializeResult,
  McpToolDefinition,
  McpToolCallResult,
  McpConnectionState,
  McpServerConfig,
  JsonRpcRequest,
  JsonRpcNotification,
} from './mcp-types.js';
import { StdioTransport } from './stdio-transport.js';
import { SseTransport } from './sse-transport.js';

const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_NAME = 'chamelion';
const CLIENT_VERSION = '0.0.1';

/**
 * MCP Client — handles the MCP protocol lifecycle:
 * initialize → tools/list → tools/call → close
 *
 * Supports runtime connect/disconnect without restart.
 */
export class McpClient {
  private transport: IMcpTransport | null = null;
  private state: McpConnectionState = 'disconnected';
  private tools: McpToolDefinition[] = [];
  private requestId = 0;
  private serverInfo: { name: string; version: string } | null = null;
  private readonly logger = createChildLogger('mcp-client');
  private toolsChangedHandler: ((tools: McpToolDefinition[]) => void) | null = null;

  readonly config: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  get connectionState(): McpConnectionState {
    return this.state;
  }

  get serverName(): string {
    return this.serverInfo?.name ?? this.config.name;
  }

  get availableTools(): readonly McpToolDefinition[] {
    return this.tools;
  }

  /** Register handler for dynamic tool list changes */
  onToolsChanged(handler: (tools: McpToolDefinition[]) => void): void {
    this.toolsChangedHandler = handler;
  }

  /** Connect to the MCP server and perform initialization handshake */
  async connect(): Promise<void> {
    if (this.state === 'ready') return;

    this.state = 'connecting';
    this.logger.info({ server: this.config.name, transport: this.config.transport }, 'Connecting to MCP server');

    try {
      this.transport = this.createTransport();

      // Start transport (spawn process or connect SSE)
      if ('start' in this.transport) {
        await (this.transport as { start(): Promise<void> }).start();
      }

      // Listen for notifications
      this.transport.onNotification((notification) => {
        this.handleNotification(notification);
      });

      // Initialize handshake
      const initResult = await this.sendRequest<McpInitializeResult>('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
      });

      this.serverInfo = initResult.serverInfo;
      this.logger.info(
        { server: initResult.serverInfo.name, version: initResult.serverInfo.version },
        'MCP server initialized',
      );

      // Send initialized notification
      await this.transport.notify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // Discover tools
      await this.refreshTools();

      this.state = 'ready';
      this.logger.info(
        { server: this.config.name, toolCount: this.tools.length },
        'MCP client ready',
      );
    } catch (error) {
      this.state = 'error';
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ server: this.config.name, error: message }, 'MCP connection failed');
      throw error;
    }
  }

  /** Disconnect from the MCP server */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return;

    this.logger.info({ server: this.config.name }, 'Disconnecting from MCP server');
    this.tools = [];
    this.state = 'disconnected';
    this.serverInfo = null;

    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  /** Refresh the tool list from the server */
  async refreshTools(): Promise<McpToolDefinition[]> {
    const result = await this.sendRequest<{ tools: McpToolDefinition[] }>('tools/list', {});
    this.tools = result.tools;
    return this.tools;
  }

  /** Call a tool on the MCP server */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    return this.sendRequest<McpToolCallResult>('tools/call', {
      name: toolName,
      arguments: args,
    });
  }

  private createTransport(): IMcpTransport {
    switch (this.config.transport) {
      case 'stdio': {
        if (!this.config.command) {
          throw new Error(`MCP server "${this.config.name}": stdio transport requires "command"`);
        }
        return new StdioTransport(this.config.command, this.config.args ?? [], this.config.env);
      }
      case 'sse': {
        if (!this.config.url) {
          throw new Error(`MCP server "${this.config.name}": sse transport requires "url"`);
        }
        return new SseTransport(this.config.url, this.config.headers);
      }
      default:
        throw new Error(`Unknown transport: ${this.config.transport}`);
    }
  }

  private async sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.transport) {
      throw new Error('MCP transport not connected');
    }

    this.requestId += 1;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.requestId,
      method,
      params,
    };

    const response = await this.transport.send(request);

    if (response.error) {
      throw new Error(`MCP error [${response.error.code}]: ${response.error.message}`);
    }

    return response.result as T;
  }

  private handleNotification(notification: JsonRpcNotification): void {
    if (notification.method === 'notifications/tools/list_changed') {
      this.logger.info({ server: this.config.name }, 'MCP tools changed, refreshing');
      this.refreshTools()
        .then((tools) => {
          this.toolsChangedHandler?.(tools);
        })
        .catch((err) => {
          this.logger.error({ error: String(err) }, 'Failed to refresh tools after change notification');
        });
    }
  }
}
