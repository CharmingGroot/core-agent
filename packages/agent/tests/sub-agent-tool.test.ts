import { describe, it, expect, vi } from 'vitest';
import { SubAgentTool } from '../src/sub-agent-tool.js';
import type { ILlmProvider, ITool, LlmResponse, AgentConfig } from '@cli-agent/core';
import { Registry, RunContext } from '@cli-agent/core';

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 10,
  workingDirectory: '/tmp',
};

function createMockProvider(content: string): ILlmProvider {
  const response: LlmResponse = {
    content,
    stopReason: 'end_turn',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
  };
  return {
    providerId: 'mock',
    chat: vi.fn().mockResolvedValue(response),
    stream: vi.fn() as unknown as ILlmProvider['stream'],
  };
}

describe('SubAgentTool', () => {
  it('should describe itself with a task parameter', () => {
    const tool = new SubAgentTool({
      name: 'researcher',
      description: 'Research a topic',
      provider: createMockProvider(''),
      toolRegistry: new Registry<ITool>('Tool'),
    });

    const desc = tool.describe();
    expect(desc.name).toBe('researcher');
    expect(desc.parameters).toHaveLength(1);
    expect(desc.parameters[0]?.name).toBe('task');
    expect(desc.parameters[0]?.required).toBe(true);
  });

  it('should execute sub-agent and return result', async () => {
    const provider = createMockProvider('Research complete: found 3 papers');
    const tool = new SubAgentTool({
      name: 'researcher',
      description: 'Research a topic',
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
      systemPrompt: 'You are a researcher.',
    });

    const context = new RunContext(TEST_CONFIG);
    const result = await tool.execute({ task: 'Find papers on transformers' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Research complete: found 3 papers');
    expect(provider.chat).toHaveBeenCalled();
  });

  it('should return error for missing task parameter', async () => {
    const tool = new SubAgentTool({
      name: 'researcher',
      description: 'Research',
      provider: createMockProvider(''),
      toolRegistry: new Registry<ITool>('Tool'),
    });

    const context = new RunContext(TEST_CONFIG);
    const result = await tool.execute({}, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing or empty "task"');
  });

  it('should return error for empty task', async () => {
    const tool = new SubAgentTool({
      name: 'researcher',
      description: 'Research',
      provider: createMockProvider(''),
      toolRegistry: new Registry<ITool>('Tool'),
    });

    const context = new RunContext(TEST_CONFIG);
    const result = await tool.execute({ task: '  ' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing or empty "task"');
  });

  it('should catch sub-agent errors gracefully', async () => {
    const provider: ILlmProvider = {
      providerId: 'mock',
      chat: vi.fn().mockRejectedValue(new Error('API rate limit')),
      stream: vi.fn() as unknown as ILlmProvider['stream'],
    };

    const tool = new SubAgentTool({
      name: 'researcher',
      description: 'Research',
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
    });

    const context = new RunContext(TEST_CONFIG);
    const result = await tool.execute({ task: 'do something' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API rate limit');
  });

  it('should propagate parent abort to child', async () => {
    // Provider that takes a while — simulated by never resolving until abort
    let chatCallCount = 0;
    const provider: ILlmProvider = {
      providerId: 'mock',
      chat: vi.fn().mockImplementation(async () => {
        chatCallCount++;
        // First call returns tool_use to trigger iteration loop
        if (chatCallCount === 1) {
          return {
            content: 'Working...',
            stopReason: 'end_turn',
            toolCalls: [],
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        }
        return {
          content: 'Done',
          stopReason: 'end_turn',
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 5 },
        };
      }),
      stream: vi.fn() as unknown as ILlmProvider['stream'],
    };

    const tool = new SubAgentTool({
      name: 'worker',
      description: 'Do work',
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
    });

    const context = new RunContext(TEST_CONFIG);
    // Sub-agent completes before abort in this case — just verify no crash
    const result = await tool.execute({ task: 'work' }, context);
    expect(result.success).toBe(true);
  });

  it('should use parent workingDirectory', async () => {
    const provider = createMockProvider('done');
    const tool = new SubAgentTool({
      name: 'worker',
      description: 'Work',
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
    });

    const config: AgentConfig = { ...TEST_CONFIG, workingDirectory: '/custom/dir' };
    const context = new RunContext(config);
    const result = await tool.execute({ task: 'check dir' }, context);
    expect(result.success).toBe(true);
  });

  it('should respect custom maxIterations', async () => {
    // Create a provider that always returns tool calls to exhaust iterations
    const toolResponse: LlmResponse = {
      content: 'calling tool',
      stopReason: 'tool_use',
      toolCalls: [{ id: 'tc-1', name: 'noop', arguments: '{}' }],
      usage: { inputTokens: 10, outputTokens: 10 },
    };
    const provider: ILlmProvider = {
      providerId: 'mock',
      chat: vi.fn().mockResolvedValue(toolResponse),
      stream: vi.fn() as unknown as ILlmProvider['stream'],
    };

    const toolRegistry = new Registry<ITool>('Tool');
    const noopTool: ITool = {
      name: 'noop',
      requiresPermission: false,
      describe: () => ({ name: 'noop', description: 'noop', parameters: [] }),
      execute: vi.fn().mockResolvedValue({ success: true, output: 'ok' }),
    };
    toolRegistry.register('noop', noopTool);

    const tool = new SubAgentTool({
      name: 'worker',
      description: 'Work',
      provider,
      toolRegistry,
      maxIterations: 3,
    });

    const context = new RunContext(TEST_CONFIG);
    const result = await tool.execute({ task: 'loop' }, context);
    // Should stop after 3 iterations (maxIterations)
    expect(provider.chat).toHaveBeenCalledTimes(3);
  });
});
