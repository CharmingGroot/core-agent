import { describe, it, expect, vi } from 'vitest';
import { McpToolProxy } from '../src/mcp-tool-proxy.js';
import type { McpClient } from '../src/mcp-client.js';
import type { McpToolDefinition, McpToolCallResult } from '../src/mcp-types.js';
import { RunContext, EventBus } from '@cli-agent/core';

function createMockClient(serverName: string): McpClient {
  return {
    serverName,
    callTool: vi.fn(async (): Promise<McpToolCallResult> => ({
      content: [{ type: 'text', text: 'Tool output text' }],
    })),
  } as unknown as McpClient;
}

function createContext(): RunContext {
  return new RunContext('test-run', '/tmp', new EventBus());
}

const sampleTool: McpToolDefinition = {
  name: 'create_issue',
  description: 'Create a GitHub issue',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Issue title' },
      body: { type: 'string', description: 'Issue body' },
      labels: { type: 'string', description: 'Comma-separated labels' },
    },
    required: ['title'],
  },
};

describe('McpToolProxy', () => {
  it('should prefix tool name with server name', () => {
    const client = createMockClient('github');
    const proxy = new McpToolProxy(client, sampleTool);

    expect(proxy.name).toBe('github__create_issue');
    expect(proxy.originalName).toBe('create_issue');
  });

  it('should require permission by default', () => {
    const client = createMockClient('github');
    const proxy = new McpToolProxy(client, sampleTool);

    expect(proxy.requiresPermission).toBe(true);
  });

  it('should describe tool with parameters from schema', () => {
    const client = createMockClient('github');
    const proxy = new McpToolProxy(client, sampleTool);

    const desc = proxy.describe();
    expect(desc.name).toBe('github__create_issue');
    expect(desc.description).toBe('Create a GitHub issue');
    expect(desc.parameters).toHaveLength(3);

    const titleParam = desc.parameters.find((p) => p.name === 'title');
    expect(titleParam?.required).toBe(true);
    expect(titleParam?.type).toBe('string');

    const bodyParam = desc.parameters.find((p) => p.name === 'body');
    expect(bodyParam?.required).toBe(false);
  });

  it('should execute tool via MCP client', async () => {
    const client = createMockClient('github');
    const proxy = new McpToolProxy(client, sampleTool);
    const ctx = createContext();

    const result = await proxy.execute({ title: 'Bug report' }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Tool output text');
    expect(client.callTool).toHaveBeenCalledWith('create_issue', { title: 'Bug report' });
  });

  it('should handle error results from MCP', async () => {
    const client = createMockClient('github');
    (client.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Permission denied' }],
      isError: true,
    });

    const proxy = new McpToolProxy(client, sampleTool);
    const ctx = createContext();
    const result = await proxy.execute({ title: 'test' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Permission denied');
  });

  it('should throw ToolExecutionError on transport failure', async () => {
    const client = createMockClient('github');
    (client.callTool as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection lost'));

    const proxy = new McpToolProxy(client, sampleTool);
    const ctx = createContext();

    await expect(proxy.execute({ title: 'test' }, ctx)).rejects.toThrow('Connection lost');
  });

  it('should handle tool with empty input schema', () => {
    const client = createMockClient('server');
    const emptyTool: McpToolDefinition = {
      name: 'ping',
      inputSchema: { type: 'object' },
    };

    const proxy = new McpToolProxy(client, emptyTool);
    const desc = proxy.describe();

    expect(desc.parameters).toHaveLength(0);
    expect(desc.description).toContain('server');
  });

  it('should concatenate multiple text content blocks', async () => {
    const client = createMockClient('server');
    (client.callTool as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'Line 1' },
        { type: 'image', data: 'base64...' },
        { type: 'text', text: 'Line 2' },
      ],
    });

    const proxy = new McpToolProxy(client, sampleTool);
    const ctx = createContext();
    const result = await proxy.execute({}, ctx);

    expect(result.output).toBe('Line 1\nLine 2');
  });
});
