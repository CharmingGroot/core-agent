import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolDispatcher } from '../src/tool-dispatcher.js';
import { PermissionManager } from '../src/permission.js';
import type { ITool, ToolCall, AgentConfig } from '@cli-agent/core';
import { Registry, RunContext, PermissionDeniedError } from '@cli-agent/core';

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: '/tmp',
};

function createMockTool(name: string, requiresPermission = false): ITool {
  return {
    name,
    requiresPermission,
    describe: () => ({ name, description: 'Mock tool', parameters: [] }),
    execute: vi.fn().mockResolvedValue({ success: true, output: `${name} result` }),
  };
}

describe('ToolDispatcher', () => {
  let toolRegistry: Registry<ITool>;
  let permissionManager: PermissionManager;
  let dispatcher: ToolDispatcher;
  let context: RunContext;

  beforeEach(() => {
    toolRegistry = new Registry<ITool>('Tool');
    permissionManager = new PermissionManager();
    dispatcher = new ToolDispatcher(toolRegistry, permissionManager);
    context = new RunContext(TEST_CONFIG);
  });

  it('should dispatch a tool call', async () => {
    const tool = createMockTool('file_read');
    toolRegistry.register('file_read', tool);

    const toolCall: ToolCall = {
      id: 'tc-1',
      name: 'file_read',
      arguments: '{"path":"test.txt"}',
    };

    const result = await dispatcher.dispatch(toolCall, context);
    expect(result.success).toBe(true);
    expect(result.output).toBe('file_read result');
    expect(tool.execute).toHaveBeenCalled();
  });

  it('should return error for unknown tool', async () => {
    const toolCall: ToolCall = {
      id: 'tc-1',
      name: 'unknown_tool',
      arguments: '{}',
    };

    const result = await dispatcher.dispatch(toolCall, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('should return error for invalid JSON arguments', async () => {
    const tool = createMockTool('file_read');
    toolRegistry.register('file_read', tool);

    const toolCall: ToolCall = {
      id: 'tc-1',
      name: 'file_read',
      arguments: 'not json',
    };

    const result = await dispatcher.dispatch(toolCall, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid tool arguments');
  });

  it('should throw PermissionDeniedError when denied', async () => {
    const handler = vi.fn().mockResolvedValue(false);
    const pm = new PermissionManager(handler);
    const d = new ToolDispatcher(toolRegistry, pm);

    const tool = createMockTool('shell_exec', true);
    toolRegistry.register('shell_exec', tool);

    const toolCall: ToolCall = {
      id: 'tc-1',
      name: 'shell_exec',
      arguments: '{"command":"ls"}',
    };

    await expect(d.dispatch(toolCall, context)).rejects.toThrow(PermissionDeniedError);
  });

  it('should dispatch all tool calls', async () => {
    toolRegistry.register('tool_a', createMockTool('tool_a'));
    toolRegistry.register('tool_b', createMockTool('tool_b'));

    const toolCalls: ToolCall[] = [
      { id: 'tc-1', name: 'tool_a', arguments: '{}' },
      { id: 'tc-2', name: 'tool_b', arguments: '{}' },
    ];

    const results = await dispatcher.dispatchAll(toolCalls, context);
    expect(results.size).toBe(2);
    expect(results.get('tc-1')?.success).toBe(true);
    expect(results.get('tc-2')?.success).toBe(true);
  });

  it('should emit tool:start and tool:end events', async () => {
    const tool = createMockTool('file_read');
    toolRegistry.register('file_read', tool);

    const startHandler = vi.fn();
    const endHandler = vi.fn();
    context.eventBus.on('tool:start', startHandler);
    context.eventBus.on('tool:end', endHandler);

    const toolCall: ToolCall = {
      id: 'tc-1',
      name: 'file_read',
      arguments: '{}',
    };

    await dispatcher.dispatch(toolCall, context);
    expect(startHandler).toHaveBeenCalledOnce();
    expect(endHandler).toHaveBeenCalledOnce();
  });

  it('should truncate oversized tool output', async () => {
    const bigOutput = 'x'.repeat(100_000);
    const tool: ITool = {
      name: 'big_tool',
      requiresPermission: false,
      describe: () => ({ name: 'big_tool', description: 'test', parameters: [] }),
      execute: vi.fn().mockResolvedValue({ success: true, output: bigOutput }),
    };
    toolRegistry.register('big_tool', tool);

    const toolCall: ToolCall = { id: 'tc-1', name: 'big_tool', arguments: '{}' };
    const result = await dispatcher.dispatch(toolCall, context);

    expect(result.success).toBe(true);
    expect(result.output.length).toBeLessThan(bigOutput.length);
    expect(result.output).toContain('output truncated');
  });

  it('should not truncate output within limit', async () => {
    const normalOutput = 'x'.repeat(1000);
    const tool: ITool = {
      name: 'small_tool',
      requiresPermission: false,
      describe: () => ({ name: 'small_tool', description: 'test', parameters: [] }),
      execute: vi.fn().mockResolvedValue({ success: true, output: normalOutput }),
    };
    toolRegistry.register('small_tool', tool);

    const toolCall: ToolCall = { id: 'tc-1', name: 'small_tool', arguments: '{}' };
    const result = await dispatcher.dispatch(toolCall, context);

    expect(result.output).toBe(normalOutput);
  });

  it('should abort remaining tools when context is aborted', async () => {
    toolRegistry.register('tool_a', createMockTool('tool_a'));
    toolRegistry.register('tool_b', createMockTool('tool_b'));

    context.abort();

    const toolCalls: ToolCall[] = [
      { id: 'tc-1', name: 'tool_a', arguments: '{}' },
      { id: 'tc-2', name: 'tool_b', arguments: '{}' },
    ];

    const results = await dispatcher.dispatchAll(toolCalls, context);
    expect(results.get('tc-1')?.error).toContain('aborted');
    expect(results.get('tc-2')?.error).toContain('aborted');
  });
});
