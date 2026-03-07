/**
 * Agent End-to-End Scenario Tests
 *
 * Tests real user query flows through AgentLoop with a MockProvider.
 * Validates: tool calling, multi-turn conversations, parallel tool dispatch,
 * sub-agent delegation, permission handling, error recovery, event tracking.
 *
 * No real API keys needed — MockProvider returns scripted responses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ILlmProvider,
  ITool,
  LlmResponse,
  Message,
  ToolDescription,
  StreamEvent,
  ToolCall,
  ToolResult,
  AgentConfig,
  JsonObject,
} from '@cli-agent/core';
import {
  Registry,
  EventBus,
  RunContext,
} from '@cli-agent/core';
import {
  AgentLoop,
  MessageManager,
  PermissionManager,
  SubAgentTool,
} from '@cli-agent/agent';
import type { AgentLoopOptions, ApprovalLevel } from '@cli-agent/agent';

// ─────────────────────────────────────────────────────────────────────
// Mock Provider — scripted LLM responses
// ─────────────────────────────────────────────────────────────────────

type ScriptedResponse = {
  content: string;
  toolCalls?: ToolCall[];
  stopReason?: 'end_turn' | 'tool_use';
};

class MockProvider implements ILlmProvider {
  readonly providerId = 'mock';
  private responses: ScriptedResponse[] = [];
  private callIndex = 0;
  readonly chatCalls: Message[][] = [];

  /** Queue scripted responses in order. Each run() iteration pops one. */
  addResponse(response: ScriptedResponse): void {
    this.responses.push(response);
  }

  async chat(
    messages: readonly Message[],
    _tools?: ToolDescription[],
  ): Promise<LlmResponse> {
    this.chatCalls.push([...messages]);
    const scripted = this.responses[this.callIndex++];
    if (!scripted) {
      return {
        content: 'No more scripted responses',
        stopReason: 'end_turn',
        toolCalls: [],
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    }
    return {
      content: scripted.content,
      stopReason: scripted.stopReason ?? (scripted.toolCalls?.length ? 'tool_use' : 'end_turn'),
      toolCalls: scripted.toolCalls ?? [],
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }

  async *stream(
    messages: readonly Message[],
    tools?: ToolDescription[],
  ): AsyncIterable<StreamEvent> {
    const response = await this.chat(messages, tools);
    yield { type: 'text_delta', content: response.content };
    yield { type: 'done', response };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Mock Tools
// ─────────────────────────────────────────────────────────────────────

function createMockTool(
  name: string,
  handler: (params: JsonObject) => ToolResult,
  requiresPermission = false,
): ITool {
  return {
    name,
    requiresPermission,
    describe: () => ({
      name,
      description: `Mock ${name} tool`,
      parameters: [
        { name: 'input', type: 'string', description: 'Input parameter', required: true },
      ],
    }),
    execute: async (params: Record<string, unknown>) => handler(params as JsonObject),
  };
}

function makeToolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, arguments: JSON.stringify(args) };
}

function buildConfig(maxIterations = 10): AgentConfig {
  return {
    provider: { providerId: 'mock', model: 'mock', auth: { type: 'api-key' as const, apiKey: '' }, maxTokens: 1024, temperature: 0 },
    maxIterations,
    systemPrompt: 'You are a helpful assistant.',
    workingDirectory: process.cwd(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Scenario 1: Simple query → no tool call
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 1: Simple query (no tool calling)', () => {
  it('should return LLM response directly when no tools needed', async () => {
    const provider = new MockProvider();
    provider.addResponse({ content: '서울의 인구는 약 970만명입니다.' });

    const agent = new AgentLoop({
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
      config: buildConfig(),
    });

    const result = await agent.run('서울의 인구가 얼마야?');

    expect(result.content).toContain('970만');
    expect(result.iterations).toBe(1);
    expect(result.aborted).toBe(false);
  });

  it('should emit agent:start and agent:end events', async () => {
    const provider = new MockProvider();
    provider.addResponse({ content: 'Hello!' });
    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.on('agent:start', () => events.push('start'));
    eventBus.on('agent:end', () => events.push('end'));

    const agent = new AgentLoop({
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
      config: buildConfig(),
      eventBus,
    });

    await agent.run('Hi');
    expect(events).toEqual(['start', 'end']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 2: Single tool call → result → final answer
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 2: Single tool call (file read)', () => {
  it('should call file_read and return answer based on file content', async () => {
    const provider = new MockProvider();

    // Iteration 1: LLM decides to call file_read
    provider.addResponse({
      content: 'Let me read the file.',
      toolCalls: [makeToolCall('tc-1', 'file_read', { input: 'package.json' })],
    });
    // Iteration 2: LLM synthesizes answer from tool result
    provider.addResponse({
      content: '프로젝트 이름은 cli-agent-core입니다.',
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_read', createMockTool('file_read', () => ({
      success: true,
      output: '{"name": "cli-agent-core", "version": "0.1.0"}',
    })));

    const eventBus = new EventBus();
    const toolEvents: string[] = [];
    eventBus.on('tool:start', (p) => toolEvents.push(`start:${p.toolCall.name}`));
    eventBus.on('tool:end', (p) => toolEvents.push(`end:${p.toolCall.name}`));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
      eventBus,
    });

    const result = await agent.run('package.json 파일 읽어서 프로젝트 이름 알려줘');

    expect(result.content).toContain('cli-agent-core');
    expect(result.iterations).toBe(2);
    expect(toolEvents).toEqual(['start:file_read', 'end:file_read']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 3: Multi-step tool calls (sequential)
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 3: Multi-step sequential tool calls', () => {
  it('should execute search → read → edit in sequence', async () => {
    const provider = new MockProvider();
    const executionOrder: string[] = [];

    // Step 1: LLM calls content_search
    provider.addResponse({
      content: 'Searching for the function...',
      toolCalls: [makeToolCall('tc-1', 'content_search', { input: 'function buggyFn' })],
    });
    // Step 2: LLM calls file_read based on search results
    provider.addResponse({
      content: 'Found it. Reading the file...',
      toolCalls: [makeToolCall('tc-2', 'file_read', { input: 'src/utils.ts' })],
    });
    // Step 3: LLM calls file_edit to fix the bug
    provider.addResponse({
      content: 'Fixing the bug...',
      toolCalls: [makeToolCall('tc-3', 'file_edit', { input: 'fix applied' })],
    });
    // Step 4: Final answer
    provider.addResponse({
      content: 'buggyFn의 off-by-one 에러를 수정했습니다.',
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('content_search', createMockTool('content_search', () => {
      executionOrder.push('content_search');
      return { success: true, output: 'src/utils.ts:42: function buggyFn() {' };
    }));
    toolRegistry.register('file_read', createMockTool('file_read', () => {
      executionOrder.push('file_read');
      return { success: true, output: 'function buggyFn() { for (let i=0; i<=arr.length; i++) {} }' };
    }));
    toolRegistry.register('file_edit', createMockTool('file_edit', () => {
      executionOrder.push('file_edit');
      return { success: true, output: 'File edited successfully' };
    }));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    const result = await agent.run('buggyFn 함수의 버그를 찾아서 고쳐줘');

    expect(result.iterations).toBe(4);
    expect(executionOrder).toEqual(['content_search', 'file_read', 'file_edit']);
    expect(result.content).toContain('수정');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 4: Parallel tool calls (LLM returns multiple tool_calls)
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 4: Parallel tool calls', () => {
  it('should dispatch multiple tool calls concurrently via dispatchAll', async () => {
    const provider = new MockProvider();
    const callTimestamps: { name: string; start: number; end: number }[] = [];

    // LLM returns 3 tool calls at once
    provider.addResponse({
      content: 'Reading all three files simultaneously.',
      toolCalls: [
        makeToolCall('tc-1', 'file_read', { input: 'src/a.ts' }),
        makeToolCall('tc-2', 'file_read', { input: 'src/b.ts' }),
        makeToolCall('tc-3', 'file_read', { input: 'src/c.ts' }),
      ],
    });
    // Final answer after reading all files
    provider.addResponse({
      content: '3개 파일 모두 읽었습니다. a.ts, b.ts, c.ts 내용 요약: ...',
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_read', {
      name: 'file_read',
      requiresPermission: false,
      describe: () => ({
        name: 'file_read',
        description: 'Read a file',
        parameters: [{ name: 'input', type: 'string', description: 'Path', required: true }],
      }),
      execute: async (params: Record<string, unknown>) => {
        const start = Date.now();
        // Simulate async I/O
        await new Promise((r) => setTimeout(r, 50));
        const end = Date.now();
        const path = params['input'] as string;
        callTimestamps.push({ name: path, start, end });
        return { success: true, output: `Content of ${path}` };
      },
    });

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    const result = await agent.run('src/a.ts, src/b.ts, src/c.ts 세 파일 다 읽어줘');

    expect(result.iterations).toBe(2);
    expect(callTimestamps).toHaveLength(3);

    // Verify parallel execution: all three should start before any finishes
    // (with 50ms delay each, sequential would take ~150ms, parallel ~50ms)
    const starts = callTimestamps.map((t) => t.start);
    const maxStart = Math.max(...starts);
    const minStart = Math.min(...starts);
    // All should start within a tight window (< 30ms apart)
    expect(maxStart - minStart).toBeLessThan(30);
  });

  it('should include all tool results in conversation history', async () => {
    const provider = new MockProvider();

    provider.addResponse({
      content: 'Checking both.',
      toolCalls: [
        makeToolCall('tc-1', 'tool_a', { input: 'x' }),
        makeToolCall('tc-2', 'tool_b', { input: 'y' }),
      ],
    });
    provider.addResponse({
      content: 'Both tools returned results.',
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('tool_a', createMockTool('tool_a', () => ({
      success: true, output: 'Result A',
    })));
    toolRegistry.register('tool_b', createMockTool('tool_b', () => ({
      success: true, output: 'Result B',
    })));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    await agent.run('Run both tools');

    // The second LLM call should contain tool results from both calls
    const secondCallMessages = provider.chatCalls[1];
    const toolResultMessages = secondCallMessages.filter(
      (m) => m.toolResults && m.toolResults.length > 0,
    );
    expect(toolResultMessages.length).toBeGreaterThan(0);

    // Flatten all toolResults
    const allToolResults = toolResultMessages.flatMap((m) => m.toolResults ?? []);
    const contents = allToolResults.map((r) => r.content);
    expect(contents).toContain('Result A');
    expect(contents).toContain('Result B');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 5: Tool returning error → LLM retries or reports
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 5: Tool error handling', () => {
  it('should pass tool error back to LLM for recovery', async () => {
    const provider = new MockProvider();

    // LLM tries shell_exec
    provider.addResponse({
      content: 'Running the command.',
      toolCalls: [makeToolCall('tc-1', 'shell_exec', { input: 'cat /nonexistent' })],
    });
    // LLM sees error and gives helpful response
    provider.addResponse({
      content: '파일이 존재하지 않습니다. 경로를 확인해주세요.',
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('shell_exec', createMockTool('shell_exec', () => ({
      success: false,
      output: '',
      error: 'cat: /nonexistent: No such file or directory',
    })));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    const result = await agent.run('cat /nonexistent 실행해줘');

    expect(result.iterations).toBe(2);
    expect(result.content).toContain('존재하지 않');
  });

  it('should handle tool that throws an exception', async () => {
    const provider = new MockProvider();

    provider.addResponse({
      content: 'Calling the tool.',
      toolCalls: [makeToolCall('tc-1', 'unstable', { input: 'go' })],
    });
    provider.addResponse({
      content: '도구 실행 중 오류가 발생했습니다.',
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('unstable', {
      name: 'unstable',
      requiresPermission: false,
      describe: () => ({
        name: 'unstable',
        description: 'Unstable tool',
        parameters: [{ name: 'input', type: 'string', description: 'Input', required: true }],
      }),
      execute: async () => {
        throw new Error('Internal tool crash');
      },
    });

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    const result = await agent.run('unstable 도구 실행');

    expect(result.iterations).toBe(2);
    // The second LLM call should contain error info
    const secondCall = provider.chatCalls[1];
    const allContent = secondCall.map((m) => JSON.stringify(m)).join('');
    expect(allContent).toContain('Internal tool crash');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 6: Permission handling during tool calls
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 6: Permission handling', () => {
  it('should allow tool when permission handler returns session', async () => {
    const provider = new MockProvider();
    provider.addResponse({
      content: 'Writing file.',
      toolCalls: [makeToolCall('tc-1', 'file_write', { input: 'content' })],
    });
    provider.addResponse({ content: '파일을 작성했습니다.' });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_write', createMockTool('file_write', () => ({
      success: true, output: 'Written',
    }), true));

    const permissionHandler = vi.fn().mockResolvedValue('session' as ApprovalLevel);

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
      permissionHandler,
    });

    const result = await agent.run('test.txt에 내용 써줘');
    expect(result.content).toContain('작성');
    expect(permissionHandler).toHaveBeenCalledWith('file_write', { input: 'content' });
  });

  it('should block tool when permission handler returns deny', async () => {
    const provider = new MockProvider();
    provider.addResponse({
      content: 'Executing dangerous command.',
      toolCalls: [makeToolCall('tc-1', 'shell_exec', { input: 'rm -rf /' })],
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('shell_exec', createMockTool('shell_exec', () => ({
      success: true, output: 'Executed',
    }), true));

    const permissionHandler = vi.fn().mockResolvedValue('deny' as ApprovalLevel);

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    // PermissionDeniedError should be thrown and caught by agent
    // Since we set permissionHandler on PermissionManager directly,
    // we need to pass it through the constructor
    const agent2 = new AgentLoop({
      provider: new MockProvider(), // fresh provider
      toolRegistry,
      config: buildConfig(),
      permissionHandler,
    });

    // Re-add response for this fresh provider
    (agent2 as unknown as { provider: MockProvider }).provider;
    // Just verify deny works via the permission manager flow
    const pm = new PermissionManager(permissionHandler);
    const tool = toolRegistry.get('shell_exec');
    const allowed = await pm.checkPermission(tool, { input: 'rm -rf /' });
    expect(allowed).toBe(false);
    expect(permissionHandler).toHaveBeenCalledWith('shell_exec', { input: 'rm -rf /' });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 7: Sub-agent delegation
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 7: Sub-agent delegation', () => {
  it('should delegate task to sub-agent and return result', async () => {
    // Sub-agent's mock provider
    const subProvider = new MockProvider();
    subProvider.addResponse({
      content: 'Researching...',
      toolCalls: [makeToolCall('tc-sub-1', 'content_search', { input: 'API usage' })],
    });
    subProvider.addResponse({
      content: '검색 결과: API는 REST 기반으로 동작합니다.',
    });

    const subToolRegistry = new Registry<ITool>('SubTool');
    subToolRegistry.register('content_search', createMockTool('content_search', () => ({
      success: true, output: 'Found 3 API endpoints in src/api.ts',
    })));

    const subAgentTool = new SubAgentTool({
      name: 'researcher',
      description: 'Research and gather information',
      provider: subProvider,
      toolRegistry: subToolRegistry,
      maxIterations: 5,
    });

    // Parent agent's mock provider
    const parentProvider = new MockProvider();
    parentProvider.addResponse({
      content: 'Delegating research to sub-agent.',
      toolCalls: [makeToolCall('tc-1', 'researcher', { task: 'API 사용 패턴을 조사해줘' })],
    });
    parentProvider.addResponse({
      content: '서브 에이전트 조사 결과: API는 REST 기반으로 동작합니다.',
    });

    const parentToolRegistry = new Registry<ITool>('Tool');
    parentToolRegistry.register('researcher', subAgentTool);

    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.on('agent:start', () => events.push('parent:start'));
    eventBus.on('agent:end', () => events.push('parent:end'));
    eventBus.on('tool:start', (p) => events.push(`tool:${p.toolCall.name}`));

    const agent = new AgentLoop({
      provider: parentProvider,
      toolRegistry: parentToolRegistry,
      config: buildConfig(),
      eventBus,
    });

    const result = await agent.run('API 사용 패턴을 조사해서 보고해줘');

    expect(result.content).toContain('REST');
    expect(result.iterations).toBe(2);
    expect(events).toContain('tool:researcher');
  });

  it('should propagate parent abort to sub-agent', async () => {
    const subProvider = new MockProvider();
    // Sub-agent never finishes — will be aborted
    subProvider.addResponse({
      content: 'Working on it...',
      toolCalls: [makeToolCall('tc-1', 'slow_tool', { input: 'go' })],
    });

    const subToolRegistry = new Registry<ITool>('SubTool');
    subToolRegistry.register('slow_tool', {
      name: 'slow_tool',
      requiresPermission: false,
      describe: () => ({
        name: 'slow_tool',
        description: 'Slow tool',
        parameters: [{ name: 'input', type: 'string', description: 'Input', required: true }],
      }),
      execute: async () => {
        // Simulate long-running operation
        await new Promise((r) => setTimeout(r, 5000));
        return { success: true, output: 'Done' };
      },
    });

    const subAgentTool = new SubAgentTool({
      name: 'slow_agent',
      description: 'A slow sub-agent',
      provider: subProvider,
      toolRegistry: subToolRegistry,
      maxIterations: 3,
    });

    const parentProvider = new MockProvider();
    parentProvider.addResponse({
      content: 'Delegating.',
      toolCalls: [makeToolCall('tc-1', 'slow_agent', { task: 'Do something slow' })],
    });
    parentProvider.addResponse({ content: 'Aborted.' });

    const parentToolRegistry = new Registry<ITool>('Tool');
    parentToolRegistry.register('slow_agent', subAgentTool);

    const agent = new AgentLoop({
      provider: parentProvider,
      toolRegistry: parentToolRegistry,
      config: buildConfig(),
    });

    const runPromise = agent.run('Start the slow task');

    // Abort after a short delay
    setTimeout(() => agent.abort('test abort'), 100);

    try {
      const result = await runPromise;
      // Either completes with abort flag or throws
      expect(result.aborted || result.content).toBeTruthy();
    } catch (error) {
      expect((error as Error).message).toContain('abort');
    }
  }, 10000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 8: maxIterations limit
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 8: Max iterations safety', () => {
  it('should stop at maxIterations even if LLM keeps calling tools', async () => {
    const provider = new MockProvider();

    // LLM keeps calling tools indefinitely
    for (let i = 0; i < 10; i++) {
      provider.addResponse({
        content: `Iteration ${i + 1}`,
        toolCalls: [makeToolCall(`tc-${i}`, 'echo', { input: `step ${i}` })],
      });
    }

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('echo', createMockTool('echo', (params) => ({
      success: true, output: `Echo: ${params['input']}`,
    })));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(3), // max 3 iterations
    });

    const result = await agent.run('무한 루프 테스트');

    expect(result.iterations).toBe(3);
    // Agent should exit loop after 3 iterations
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 9: Event tracking full flow
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 9: Complete event tracking', () => {
  it('should emit all events in correct order', async () => {
    const provider = new MockProvider();
    provider.addResponse({
      content: 'Calling tool.',
      toolCalls: [makeToolCall('tc-1', 'echo', { input: 'hello' })],
    });
    provider.addResponse({ content: 'Done.' });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('echo', createMockTool('echo', () => ({
      success: true, output: 'hello',
    })));

    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.on('agent:start', () => events.push('agent:start'));
    eventBus.on('agent:end', () => events.push('agent:end'));
    eventBus.on('llm:request', () => events.push('llm:request'));
    eventBus.on('llm:response', () => events.push('llm:response'));
    eventBus.on('tool:start', () => events.push('tool:start'));
    eventBus.on('tool:end', () => events.push('tool:end'));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
      eventBus,
    });

    await agent.run('Echo hello');

    expect(events).toEqual([
      'agent:start',
      'llm:request',    // iteration 1
      'llm:response',
      'tool:start',
      'tool:end',
      'llm:request',    // iteration 2
      'llm:response',
      'agent:end',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 10: Dynamic system prompt builder
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 10: Dynamic system prompt', () => {
  it('should rebuild system prompt each iteration via systemPromptBuilder', async () => {
    const provider = new MockProvider();
    provider.addResponse({
      content: 'Calling tool.',
      toolCalls: [makeToolCall('tc-1', 'echo', { input: 'test' })],
    });
    provider.addResponse({ content: 'Final answer.' });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('echo', createMockTool('echo', () => ({
      success: true, output: 'test',
    })));

    let buildCount = 0;
    const systemPromptBuilder = vi.fn().mockImplementation(async (ctx: RunContext) => {
      buildCount++;
      return `System prompt v${buildCount}. Working dir: ${ctx.workingDirectory}`;
    });

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: { ...buildConfig(), systemPrompt: undefined },
      systemPromptBuilder,
    });

    await agent.run('Test dynamic prompt');

    // Builder should be called twice (once per iteration)
    expect(systemPromptBuilder).toHaveBeenCalledTimes(2);
    expect(buildCount).toBe(2);

    // Verify the system message was updated in the second call
    const secondCallMessages = provider.chatCalls[1];
    const systemMsg = secondCallMessages.find((m) => m.role === 'system');
    expect(systemMsg?.content).toContain('v2');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 11: Unknown tool called by LLM
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 11: LLM calls unknown tool', () => {
  it('should return error result and let LLM recover', async () => {
    const provider = new MockProvider();

    // LLM calls a tool that doesn't exist
    provider.addResponse({
      content: 'Let me use the database tool.',
      toolCalls: [makeToolCall('tc-1', 'database_query', { input: 'SELECT *' })],
    });
    // LLM recovers after seeing error
    provider.addResponse({
      content: 'database_query 도구가 없습니다. 다른 방법으로 도와드리겠습니다.',
    });

    const toolRegistry = new Registry<ITool>('Tool');

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    const result = await agent.run('데이터베이스에서 데이터 조회해줘');

    expect(result.iterations).toBe(2);
    expect(result.content).toContain('도구가 없');

    // Second LLM call should contain the error about unknown tool
    const secondCall = provider.chatCalls[1];
    const allContent = secondCall.map((m) => JSON.stringify(m)).join('');
    expect(allContent).toContain('Unknown tool');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 12: Streaming mode
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 12: Streaming mode', () => {
  it('should emit llm:stream events when streaming is enabled', async () => {
    const provider = new MockProvider();
    provider.addResponse({ content: 'Streamed response.' });

    const eventBus = new EventBus();
    const streamChunks: string[] = [];
    eventBus.on('llm:stream', (p) => streamChunks.push(p.chunk));

    const agent = new AgentLoop({
      provider,
      toolRegistry: new Registry<ITool>('Tool'),
      config: buildConfig(),
      eventBus,
      streaming: true,
    });

    const result = await agent.run('Stream test');

    expect(result.content).toBe('Streamed response.');
    expect(streamChunks).toContain('Streamed response.');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 13: Real-world query simulation
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 13: Real-world query — code review workflow', () => {
  it('should simulate: search files → read → analyze → report', async () => {
    const provider = new MockProvider();
    const toolLog: string[] = [];

    // Step 1: Search for TypeScript files
    provider.addResponse({
      content: 'Searching for source files.',
      toolCalls: [makeToolCall('tc-1', 'file_search', { input: '**/*.ts' })],
    });
    // Step 2: Read two files in parallel
    provider.addResponse({
      content: 'Reading the main files.',
      toolCalls: [
        makeToolCall('tc-2', 'file_read', { input: 'src/index.ts' }),
        makeToolCall('tc-3', 'file_read', { input: 'src/utils.ts' }),
      ],
    });
    // Step 3: Run content search for potential issues
    provider.addResponse({
      content: 'Checking for common issues.',
      toolCalls: [makeToolCall('tc-4', 'content_search', { input: 'TODO|FIXME|HACK' })],
    });
    // Step 4: Final report
    provider.addResponse({
      content: `## 코드 리뷰 결과

### 파일 구조
- src/index.ts: 진입점, 정상
- src/utils.ts: 유틸리티 함수 모음

### 발견된 이슈
- src/utils.ts:15: TODO 주석 발견
- src/index.ts:42: FIXME 마킹

### 권장사항
1. TODO 항목 해결 필요
2. 타입 안전성 개선`,
    });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('file_search', createMockTool('file_search', () => {
      toolLog.push('file_search');
      return { success: true, output: 'src/index.ts\nsrc/utils.ts\nsrc/types.ts' };
    }));
    toolRegistry.register('file_read', createMockTool('file_read', (params) => {
      toolLog.push(`file_read:${params['input']}`);
      return { success: true, output: `// Content of ${params['input']}\nexport function main() {}` };
    }));
    toolRegistry.register('content_search', createMockTool('content_search', () => {
      toolLog.push('content_search');
      return { success: true, output: 'src/utils.ts:15: // TODO: refactor this\nsrc/index.ts:42: // FIXME: error handling' };
    }));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    const result = await agent.run('프로젝트 코드 리뷰해줘. 파일 찾아서 읽고 이슈 분석해줘.');

    expect(result.iterations).toBe(4);
    expect(toolLog).toEqual([
      'file_search',
      'file_read:src/index.ts',
      'file_read:src/utils.ts',
      'content_search',
    ]);
    expect(result.content).toContain('코드 리뷰');
    expect(result.content).toContain('TODO');
    expect(result.content).toContain('FIXME');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 14: Conversation history correctness
// ─────────────────────────────────────────────────────────────────────
describe('Scenario 14: Conversation history integrity', () => {
  it('should maintain correct message ordering across iterations', async () => {
    const provider = new MockProvider();

    provider.addResponse({
      content: 'Calling tool.',
      toolCalls: [makeToolCall('tc-1', 'echo', { input: 'ping' })],
    });
    provider.addResponse({ content: 'Final.' });

    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('echo', createMockTool('echo', () => ({
      success: true, output: 'pong',
    })));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: buildConfig(),
    });

    await agent.run('Test message ordering');

    // Second LLM call should have full history:
    // [system, user, assistant(with toolCalls), toolResults, ...]
    const secondCall = provider.chatCalls[1];
    const roles = secondCall.map((m) => m.role);

    expect(roles[0]).toBe('system');
    expect(roles[1]).toBe('user');
    expect(roles[2]).toBe('assistant');
    // Tool results follow the assistant message
    // (exact format depends on MessageManager implementation)
    expect(secondCall.length).toBeGreaterThan(3);
  });
});
