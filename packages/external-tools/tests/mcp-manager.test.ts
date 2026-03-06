import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Registry, EventBus } from '@cli-agent/core';
import type { ITool } from '@cli-agent/core';
import { McpManager } from '../src/mcp-manager.js';
import { McpClient } from '../src/mcp-client.js';
import type { McpServerConfig } from '../src/mcp-types.js';

/** Mock McpClient for unit testing McpManager */
function mockMcpClient(config: McpServerConfig, tools: Array<{ name: string }> = []) {
  const mockTools = tools.map((t) => ({
    name: t.name,
    description: `Mock tool ${t.name}`,
    inputSchema: { type: 'object' as const },
  }));

  const client = {
    config,
    connectionState: 'ready' as const,
    serverName: config.name,
    availableTools: mockTools,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {
      client.connectionState = 'disconnected' as unknown as 'ready';
    }),
    onToolsChanged: vi.fn(),
    refreshTools: vi.fn(async () => mockTools),
    callTool: vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
    })),
  };
  return client;
}

describe('McpManager', () => {
  let registry: Registry<ITool>;
  let eventBus: EventBus;
  let manager: McpManager;

  beforeEach(() => {
    registry = new Registry<ITool>('Tool');
    eventBus = new EventBus();
    manager = new McpManager(registry, eventBus);
  });

  const githubConfig: McpServerConfig = {
    name: 'github',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  };

  const dbConfig: McpServerConfig = {
    name: 'database',
    transport: 'sse',
    url: 'http://localhost:3001',
  };

  it('should start with no connected servers', () => {
    expect(manager.connectedServers).toHaveLength(0);
    expect(manager.getAllStatus()).toHaveLength(0);
  });

  it('should connect an MCP server and register tools', async () => {
    const mockClient = mockMcpClient(githubConfig, [{ name: 'create_issue' }, { name: 'list_repos' }]);
    vi.spyOn(McpClient.prototype, 'connect').mockImplementation(mockClient.connect);
    vi.spyOn(McpClient.prototype, 'onToolsChanged').mockImplementation(mockClient.onToolsChanged);
    Object.defineProperty(McpClient.prototype, 'availableTools', { get: () => mockClient.availableTools, configurable: true });
    Object.defineProperty(McpClient.prototype, 'connectionState', { get: () => 'ready', configurable: true });
    Object.defineProperty(McpClient.prototype, 'serverName', { get: () => 'github', configurable: true });

    const status = await manager.connect(githubConfig);

    expect(status.name).toBe('github');
    expect(status.state).toBe('ready');
    expect(status.toolCount).toBe(2);
    expect(status.tools).toContain('github__create_issue');
    expect(status.tools).toContain('github__list_repos');

    // Tools should be in registry
    expect(registry.has('github__create_issue')).toBe(true);
    expect(registry.has('github__list_repos')).toBe(true);

    vi.restoreAllMocks();
  });

  it('should disconnect and unregister tools', async () => {
    const mockClient = mockMcpClient(githubConfig, [{ name: 'create_issue' }]);
    vi.spyOn(McpClient.prototype, 'connect').mockImplementation(mockClient.connect);
    vi.spyOn(McpClient.prototype, 'disconnect').mockImplementation(mockClient.disconnect);
    vi.spyOn(McpClient.prototype, 'onToolsChanged').mockImplementation(mockClient.onToolsChanged);
    Object.defineProperty(McpClient.prototype, 'availableTools', { get: () => mockClient.availableTools, configurable: true });
    Object.defineProperty(McpClient.prototype, 'connectionState', { get: () => 'ready', configurable: true });
    Object.defineProperty(McpClient.prototype, 'serverName', { get: () => 'github', configurable: true });

    await manager.connect(githubConfig);
    expect(registry.has('github__create_issue')).toBe(true);

    await manager.disconnect('github');
    expect(registry.has('github__create_issue')).toBe(false);
    expect(manager.connectedServers).toHaveLength(0);

    vi.restoreAllMocks();
  });

  it('should throw when connecting same server twice', async () => {
    const mockClient = mockMcpClient(githubConfig, []);
    vi.spyOn(McpClient.prototype, 'connect').mockImplementation(mockClient.connect);
    vi.spyOn(McpClient.prototype, 'onToolsChanged').mockImplementation(mockClient.onToolsChanged);
    Object.defineProperty(McpClient.prototype, 'availableTools', { get: () => [], configurable: true });
    Object.defineProperty(McpClient.prototype, 'connectionState', { get: () => 'ready', configurable: true });
    Object.defineProperty(McpClient.prototype, 'serverName', { get: () => 'github', configurable: true });

    await manager.connect(githubConfig);
    await expect(manager.connect(githubConfig)).rejects.toThrow('already connected');

    vi.restoreAllMocks();
  });

  it('should throw when disconnecting unknown server', async () => {
    await expect(manager.disconnect('nonexistent')).rejects.toThrow('not connected');
  });

  it('should return disconnected status for unknown server', () => {
    const status = manager.getServerStatus('unknown');
    expect(status.state).toBe('disconnected');
    expect(status.toolCount).toBe(0);
  });

  it('should emit events on connect and disconnect', async () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    eventBus.on('mcp:connected', (data) => events.push({ event: 'mcp:connected', data: data as Record<string, unknown> }));
    eventBus.on('mcp:disconnected', (data) => events.push({ event: 'mcp:disconnected', data: data as Record<string, unknown> }));

    const mockClient = mockMcpClient(githubConfig, [{ name: 'tool1' }]);
    vi.spyOn(McpClient.prototype, 'connect').mockImplementation(mockClient.connect);
    vi.spyOn(McpClient.prototype, 'disconnect').mockImplementation(mockClient.disconnect);
    vi.spyOn(McpClient.prototype, 'onToolsChanged').mockImplementation(mockClient.onToolsChanged);
    Object.defineProperty(McpClient.prototype, 'availableTools', { get: () => mockClient.availableTools, configurable: true });
    Object.defineProperty(McpClient.prototype, 'connectionState', { get: () => 'ready', configurable: true });
    Object.defineProperty(McpClient.prototype, 'serverName', { get: () => 'github', configurable: true });

    await manager.connect(githubConfig);
    await manager.disconnect('github');

    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('mcp:connected');
    expect(events[1].event).toBe('mcp:disconnected');

    vi.restoreAllMocks();
  });

  it('should check connection status', async () => {
    expect(manager.isConnected('github')).toBe(false);

    const mockClient = mockMcpClient(githubConfig, []);
    vi.spyOn(McpClient.prototype, 'connect').mockImplementation(mockClient.connect);
    vi.spyOn(McpClient.prototype, 'onToolsChanged').mockImplementation(mockClient.onToolsChanged);
    Object.defineProperty(McpClient.prototype, 'availableTools', { get: () => [], configurable: true });
    Object.defineProperty(McpClient.prototype, 'connectionState', { get: () => 'ready', configurable: true });
    Object.defineProperty(McpClient.prototype, 'serverName', { get: () => 'github', configurable: true });

    await manager.connect(githubConfig);
    expect(manager.isConnected('github')).toBe(true);

    vi.restoreAllMocks();
  });

  it('should disconnect all servers', async () => {
    const mockClient = mockMcpClient(githubConfig, []);
    vi.spyOn(McpClient.prototype, 'connect').mockImplementation(mockClient.connect);
    vi.spyOn(McpClient.prototype, 'disconnect').mockImplementation(mockClient.disconnect);
    vi.spyOn(McpClient.prototype, 'onToolsChanged').mockImplementation(mockClient.onToolsChanged);
    Object.defineProperty(McpClient.prototype, 'availableTools', { get: () => [], configurable: true });
    Object.defineProperty(McpClient.prototype, 'connectionState', { get: () => 'ready', configurable: true });
    Object.defineProperty(McpClient.prototype, 'serverName', { get: () => githubConfig.name, configurable: true });

    await manager.connect(githubConfig);
    expect(manager.connectedServers).toHaveLength(1);

    await manager.disconnectAll();
    expect(manager.connectedServers).toHaveLength(0);

    vi.restoreAllMocks();
  });
});
