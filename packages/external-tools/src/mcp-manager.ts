import type { ITool, EventName, EventPayload } from '@cli-agent/core';
import { Registry, createChildLogger } from '@cli-agent/core';
import type { EventBus } from '@cli-agent/core';
import { McpClient } from './mcp-client.js';
import { McpToolProxy } from './mcp-tool-proxy.js';
import type { McpServerConfig, McpConnectionState } from './mcp-types.js';

/** Status of a single MCP server connection */
export interface McpServerStatus {
  readonly name: string;
  readonly state: McpConnectionState;
  readonly transport: 'stdio' | 'sse';
  readonly toolCount: number;
  readonly tools: readonly string[];
}

/**
 * McpManager — manages multiple MCP server connections at runtime.
 *
 * Responsibilities:
 * - Connect/disconnect MCP servers dynamically (no restart needed)
 * - Auto-register discovered MCP tools into the tool Registry
 * - Auto-unregister tools when a server disconnects
 * - Handle tool list change notifications
 */
export class McpManager {
  private readonly clients = new Map<string, McpClient>();
  private readonly toolRegistry: Registry<ITool>;
  private readonly registeredTools = new Map<string, string[]>(); // serverName -> tool names
  private readonly eventBus: EventBus | null;
  private readonly logger = createChildLogger('mcp-manager');

  constructor(toolRegistry: Registry<ITool>, eventBus?: EventBus) {
    this.toolRegistry = toolRegistry;
    this.eventBus = eventBus ?? null;
  }

  /** Connect to an MCP server and register its tools */
  async connect(config: McpServerConfig): Promise<McpServerStatus> {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP server "${config.name}" is already connected`);
    }

    this.logger.info({ server: config.name, transport: config.transport }, 'Connecting MCP server');

    const client = new McpClient(config);

    // Handle dynamic tool changes
    client.onToolsChanged((tools) => {
      this.logger.info({ server: config.name, count: tools.length }, 'MCP tools changed');
      this.unregisterServerTools(config.name);
      this.registerServerTools(config.name, client);
      this.emitEvent('mcp:tools_changed', { server: config.name, tools: tools.map((t) => t.name) });
    });

    await client.connect();
    this.clients.set(config.name, client);

    // Register tools
    this.registerServerTools(config.name, client);

    const status = this.getServerStatus(config.name);
    this.emitEvent('mcp:connected', { server: config.name, toolCount: status.toolCount });

    return status;
  }

  /** Disconnect an MCP server and unregister its tools */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    this.logger.info({ server: serverName }, 'Disconnecting MCP server');

    this.unregisterServerTools(serverName);
    await client.disconnect();
    this.clients.delete(serverName);

    this.emitEvent('mcp:disconnected', { server: serverName });
  }

  /** Disconnect all MCP servers */
  async disconnectAll(): Promise<void> {
    const names = [...this.clients.keys()];
    for (const name of names) {
      await this.disconnect(name);
    }
  }

  /** Reconnect an MCP server (disconnect + connect) */
  async reconnect(serverName: string): Promise<McpServerStatus> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" is not connected`);
    }

    const config = client.config;
    await this.disconnect(serverName);
    return this.connect(config);
  }

  /** Get status of a specific MCP server */
  getServerStatus(serverName: string): McpServerStatus {
    const client = this.clients.get(serverName);
    if (!client) {
      return {
        name: serverName,
        state: 'disconnected',
        transport: 'stdio',
        toolCount: 0,
        tools: [],
      };
    }

    const toolNames = this.registeredTools.get(serverName) ?? [];

    return {
      name: serverName,
      state: client.connectionState,
      transport: client.config.transport,
      toolCount: toolNames.length,
      tools: toolNames,
    };
  }

  /** Get status of all connected MCP servers */
  getAllStatus(): McpServerStatus[] {
    return [...this.clients.keys()].map((name) => this.getServerStatus(name));
  }

  /** Check if a server is connected */
  isConnected(serverName: string): boolean {
    const client = this.clients.get(serverName);
    return client?.connectionState === 'ready';
  }

  /** Get list of connected server names */
  get connectedServers(): readonly string[] {
    return [...this.clients.keys()];
  }

  private registerServerTools(serverName: string, client: McpClient): void {
    const toolNames: string[] = [];

    for (const toolDef of client.availableTools) {
      const proxy = new McpToolProxy(client, toolDef);

      if (this.toolRegistry.has(proxy.name)) {
        this.logger.warn({ tool: proxy.name }, 'MCP tool name collision, skipping');
        continue;
      }

      this.toolRegistry.register(proxy.name, proxy);
      toolNames.push(proxy.name);
      this.logger.debug({ tool: proxy.name }, 'Registered MCP tool');
    }

    this.registeredTools.set(serverName, toolNames);
    this.logger.info({ server: serverName, count: toolNames.length }, 'MCP tools registered');
  }

  private unregisterServerTools(serverName: string): void {
    const toolNames = this.registeredTools.get(serverName);
    if (!toolNames) return;

    for (const name of toolNames) {
      if (this.toolRegistry.has(name)) {
        this.toolRegistry.unregister(name);
        this.logger.debug({ tool: name }, 'Unregistered MCP tool');
      }
    }

    this.registeredTools.delete(serverName);
  }

  private emitEvent<K extends EventName>(event: K, payload: EventPayload<K>): void {
    if (this.eventBus) {
      this.eventBus.emit(event, payload);
    }
  }
}
