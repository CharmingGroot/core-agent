import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMcpTransport } from '../src/mcp-transport.js';
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from '../src/mcp-types.js';
import { McpClient } from '../src/mcp-client.js';

/** Creates a mock transport that responds to MCP protocol messages */
function createMockTransport(): IMcpTransport & { start: () => Promise<void> } {
  const tools = [
    {
      name: 'get_issue',
      description: 'Get a GitHub issue',
      inputSchema: {
        type: 'object' as const,
        properties: {
          owner: { type: 'string', description: 'Repo owner' },
          repo: { type: 'string', description: 'Repo name' },
          number: { type: 'number', description: 'Issue number' },
        },
        required: ['owner', 'repo', 'number'],
      },
    },
    {
      name: 'list_repos',
      description: 'List repositories',
      inputSchema: { type: 'object' as const },
    },
  ];

  let notificationHandler: ((n: JsonRpcNotification) => void) | null = null;

  return {
    connected: true,
    start: vi.fn(async () => {}),
    send: vi.fn(async (request: JsonRpcRequest): Promise<JsonRpcResponse> => {
      if (request.method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'mock-server', version: '1.0.0' },
          },
        };
      }
      if (request.method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: { tools },
        };
      }
      if (request.method === 'tools/call') {
        const params = request.params as { name: string; arguments: Record<string, unknown> };
        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [{ type: 'text', text: `Called ${params.name} with ${JSON.stringify(params.arguments)}` }],
          },
        };
      }
      return { jsonrpc: '2.0', id: request.id, error: { code: -1, message: 'Unknown method' } };
    }),
    notify: vi.fn(async () => {}),
    onNotification: vi.fn((handler: (n: JsonRpcNotification) => void) => {
      notificationHandler = handler;
    }),
    close: vi.fn(async () => {}),
    _triggerNotification(notification: JsonRpcNotification) {
      notificationHandler?.(notification);
    },
  } as IMcpTransport & { start: () => Promise<void>; _triggerNotification: (n: JsonRpcNotification) => void };
}

describe('McpClient', () => {
  let client: McpClient;
  let mockTransport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    mockTransport = createMockTransport();
    client = new McpClient({ name: 'test-server', transport: 'stdio', command: 'echo' });
    // Inject mock transport
    (client as unknown as { createTransport: () => IMcpTransport }).createTransport = () => mockTransport;
  });

  it('should start in disconnected state', () => {
    expect(client.connectionState).toBe('disconnected');
  });

  it('should connect and discover tools', async () => {
    await client.connect();

    expect(client.connectionState).toBe('ready');
    expect(client.serverName).toBe('mock-server');
    expect(client.availableTools).toHaveLength(2);
    expect(client.availableTools[0].name).toBe('get_issue');
    expect(client.availableTools[1].name).toBe('list_repos');
  });

  it('should send initialize and initialized notification', async () => {
    await client.connect();

    expect(mockTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'initialize' }),
    );
    expect(mockTransport.notify).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'notifications/initialized' }),
    );
  });

  it('should call tools on the server', async () => {
    await client.connect();

    const result = await client.callTool('get_issue', { owner: 'test', repo: 'repo', number: 1 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toContain('get_issue');
  });

  it('should disconnect cleanly', async () => {
    await client.connect();
    await client.disconnect();

    expect(client.connectionState).toBe('disconnected');
    expect(client.availableTools).toHaveLength(0);
    expect(mockTransport.close).toHaveBeenCalled();
  });

  it('should refresh tools', async () => {
    await client.connect();

    const tools = await client.refreshTools();
    expect(tools).toHaveLength(2);
  });

  it('should throw on unknown transport type', () => {
    const badClient = new McpClient({ name: 'bad', transport: 'websocket' as 'stdio' });
    expect(() => {
      (badClient as unknown as { createTransport: () => IMcpTransport }).createTransport();
    }).toThrow();
  });

  it('should handle MCP error responses', async () => {
    mockTransport.send = vi.fn(async (request: JsonRpcRequest) => {
      if (request.method === 'initialize') {
        return {
          jsonrpc: '2.0' as const,
          id: request.id,
          error: { code: -32600, message: 'Invalid request' },
        };
      }
      return { jsonrpc: '2.0' as const, id: request.id, result: {} };
    });

    await expect(client.connect()).rejects.toThrow('Invalid request');
    expect(client.connectionState).toBe('error');
  });

  it('should not reconnect if already ready', async () => {
    await client.connect();
    const sendCount = (mockTransport.send as ReturnType<typeof vi.fn>).mock.calls.length;

    await client.connect(); // should be no-op
    expect((mockTransport.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(sendCount);
  });
});
