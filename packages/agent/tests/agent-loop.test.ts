import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLoop } from '../src/agent-loop.js';
import type {
  ILlmProvider,
  ITool,
  LlmResponse,
  Message,
  StreamEvent,
  ToolDescription,
  AgentConfig,
} from '@cli-agent/core';
import { Registry } from '@cli-agent/core';

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 10,
  workingDirectory: '/tmp',
  systemPrompt: 'You are a test agent.',
};

function createMockProvider(responses: LlmResponse[]): ILlmProvider {
  let callIndex = 0;
  return {
    providerId: 'mock',
    chat: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex];
      callIndex++;
      return response;
    }),
    stream: vi.fn() as unknown as ILlmProvider['stream'],
  };
}

function createMockTool(name: string): ITool {
  return {
    name,
    requiresPermission: false,
    describe: () => ({ name, description: 'Mock', parameters: [] }),
    execute: vi.fn().mockResolvedValue({ success: true, output: `${name} done` }),
  };
}

describe('AgentLoop', () => {
  it('should return response on end_turn', async () => {
    const provider = createMockProvider([
      {
        content: 'Hello!',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
    });

    const result = await agent.run('Hi');
    expect(result.content).toBe('Hello!');
    expect(result.iterations).toBe(1);
    expect(result.aborted).toBe(false);
  });

  it('should handle tool call loop', async () => {
    const provider = createMockProvider([
      {
        content: 'Let me read the file.',
        stopReason: 'tool_use',
        toolCalls: [
          { id: 'tc-1', name: 'file_read', arguments: '{"path":"test.txt"}' },
        ],
        usage: { inputTokens: 10, outputTokens: 15 },
      },
      {
        content: 'The file says hello.',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 30, outputTokens: 10 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_read', createMockTool('file_read'));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
    });

    const result = await agent.run('Read test.txt');
    expect(result.content).toBe('The file says hello.');
    expect(result.iterations).toBe(2);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('should emit agent:start and agent:end events', async () => {
    const provider = createMockProvider([
      {
        content: 'Done',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 5, outputTokens: 5 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
    });

    const startHandler = vi.fn();
    const endHandler = vi.fn();
    agent.eventBus.on('agent:start', startHandler);
    agent.eventBus.on('agent:end', endHandler);

    await agent.run('test');
    expect(startHandler).toHaveBeenCalledOnce();
    expect(endHandler).toHaveBeenCalledOnce();
  });

  it('should stop after maxIterations', async () => {
    const infiniteToolResponse: LlmResponse = {
      content: 'Calling tool again',
      stopReason: 'tool_use',
      toolCalls: [{ id: 'tc-1', name: 'file_read', arguments: '{}' }],
      usage: { inputTokens: 10, outputTokens: 10 },
    };

    const responses = Array.from({ length: 10 }, () => infiniteToolResponse);
    const provider = createMockProvider(responses);

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_read', createMockTool('file_read'));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: { ...TEST_CONFIG, maxIterations: 3 },
    });

    const result = await agent.run('loop forever');
    expect(result.iterations).toBe(3);
  });

  it('should handle abort', async () => {
    const provider = createMockProvider([
      {
        content: 'Processing...',
        stopReason: 'tool_use',
        toolCalls: [{ id: 'tc-1', name: 'slow_tool', arguments: '{}' }],
        usage: { inputTokens: 10, outputTokens: 10 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    const slowTool: ITool = {
      name: 'slow_tool',
      requiresPermission: false,
      describe: () => ({ name: 'slow_tool', description: '', parameters: [] }),
      execute: async () => {
        // Simulate slow work
        return { success: true, output: 'done' };
      },
    };
    toolRegistry.register('slow_tool', slowTool);

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
    });

    // Abort before running
    agent.abort('test');
    await expect(agent.run('test')).rejects.toThrow('aborted');
  });

  it('should emit agent:error on failure', async () => {
    const provider: ILlmProvider = {
      providerId: 'mock',
      chat: vi.fn().mockRejectedValue(new Error('API down')),
      stream: vi.fn() as unknown as ILlmProvider['stream'],
    };

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
    });

    const errorHandler = vi.fn();
    agent.eventBus.on('agent:error', errorHandler);

    await expect(agent.run('test')).rejects.toThrow('API down');
    expect(errorHandler).toHaveBeenCalledOnce();
  });

  it('should have unique runId', () => {
    const toolRegistry = new Registry<ITool>('Tool');
    const provider = createMockProvider([]);
    const agent1 = new AgentLoop({ provider, toolRegistry, config: TEST_CONFIG });
    const agent2 = new AgentLoop({ provider, toolRegistry, config: TEST_CONFIG });
    expect(agent1.runId).not.toBe(agent2.runId);
  });

  it('should use streaming when enabled', async () => {
    const finalResponse: LlmResponse = {
      content: 'Hello world',
      stopReason: 'end_turn',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 },
    };

    const streamEvents: StreamEvent[] = [
      { type: 'text_delta', content: 'Hello' },
      { type: 'text_delta', content: ' world' },
      { type: 'done', response: finalResponse },
    ];

    const provider: ILlmProvider = {
      providerId: 'mock',
      chat: vi.fn(),
      async *stream() {
        for (const event of streamEvents) {
          yield event;
        }
      },
    };

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
      streaming: true,
    });

    const chunks: string[] = [];
    agent.eventBus.on('llm:stream', (payload) => {
      chunks.push(payload.chunk);
    });

    const result = await agent.run('Hi');
    expect(result.content).toBe('Hello world');
    expect(chunks).toEqual(['Hello', ' world']);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('should use systemPromptBuilder to rebuild prompt each iteration', async () => {
    let buildCount = 0;
    const provider = createMockProvider([
      {
        content: 'Calling tool',
        stopReason: 'tool_use',
        toolCalls: [{ id: 'tc-1', name: 'file_read', arguments: '{}' }],
        usage: { inputTokens: 10, outputTokens: 10 },
      },
      {
        content: 'Done',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_read', createMockTool('file_read'));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: { ...TEST_CONFIG, systemPrompt: undefined },
      systemPromptBuilder: () => {
        buildCount++;
        return `Dynamic prompt v${buildCount}`;
      },
    });

    await agent.run('test');
    // Builder called once per iteration (2 iterations)
    expect(buildCount).toBe(2);

    // Last call should have the latest prompt
    const lastCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[1];
    const messages = lastCall[0] as Message[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toBe('Dynamic prompt v2');
  });

  it('should support async systemPromptBuilder', async () => {
    const provider = createMockProvider([
      {
        content: 'Hi',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: { ...TEST_CONFIG, systemPrompt: undefined },
      systemPromptBuilder: async () => {
        return 'Async prompt';
      },
    });

    await agent.run('Hello');
    const chatCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages = chatCall[0] as Message[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toBe('Async prompt');
  });

  it('should prefer systemPromptBuilder over static systemPrompt', async () => {
    const provider = createMockProvider([
      {
        content: 'Hi',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG, // has systemPrompt: 'You are a test agent.'
      systemPromptBuilder: () => 'Builder wins',
    });

    await agent.run('Hello');
    const chatCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages = chatCall[0] as Message[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toBe('Builder wins');
  });

  it('should include system prompt in messages', async () => {
    const provider = createMockProvider([
      {
        content: 'Hi',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      },
    ]);

    const toolRegistry = new Registry<ITool>('Tool');
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: TEST_CONFIG,
    });

    await agent.run('Hello');
    const chatCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const messages = chatCall[0] as Message[];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toBe('You are a test agent.');
  });
});
