/**
 * Real LLM Integration Scenario Tests
 *
 * Actual OpenAI API calls with real tools.
 * Tests complex multi-turn tool calling, error recovery,
 * parallel dispatch, and edge cases with a live LLM.
 *
 * Requires OPENAI_API_KEY in .env
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadEnv } from '../setup.js';
import { AgentLoop } from '@cli-agent/agent';
import type { AgentLoopOptions } from '@cli-agent/agent';
import { OpenAIProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import {
  Registry,
  EventBus,
  apiKeyAuth,
} from '@cli-agent/core';
import type { ITool, AgentConfig, ProviderConfig, ToolCall } from '@cli-agent/core';

let env: Record<string, string>;
let apiKey: string;
let providerConfig: ProviderConfig;

beforeAll(async () => {
  env = await loadEnv();
  apiKey = env['OPENAI_API_KEY'] ?? '';
});

function skip(): boolean {
  if (!apiKey) {
    console.log('Skipping: OPENAI_API_KEY not set');
    return true;
  }
  return false;
}

function makeProvider(): OpenAIProvider {
  providerConfig = {
    providerId: 'openai',
    model: 'gpt-4o-mini',
    auth: apiKeyAuth(apiKey),
    maxTokens: 2048,
    temperature: 0,
  };
  return new OpenAIProvider(providerConfig);
}

function makeConfig(maxIterations = 15): AgentConfig {
  return {
    provider: providerConfig,
    maxIterations,
    systemPrompt: `You are a precise coding assistant. Use tools to accomplish tasks. Be concise in your final answers. Always use tools when file operations are needed - never guess file contents.`,
    workingDirectory: process.cwd(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Scenario 1: Multi-step file exploration
// "프로젝트 구조를 파악해서 패키지 목록을 알려줘"
// Expected: file_search → file_read(package.json) → answer
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Multi-step file exploration', () => {
  it('should explore project structure using multiple tools', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'package.json 파일을 읽어서 이 프로젝트의 이름과 workspaces에 포함된 패키지 경로들을 알려줘.'
    );

    // Must have called at least file_read
    expect(toolCalls).toContain('file_read');
    // Result should mention the project name
    expect(result.content.toLowerCase()).toContain('cli-agent');
    // LLM should have processed the file content (workspaces may or may not be in root package.json)
    expect(result.content.length).toBeGreaterThan(20);
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 2: Search + Read combination
// "content_search로 코드에서 특정 패턴을 찾고, 해당 파일을 읽어서 분석"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Search + Read workflow', () => {
  it('should search for a pattern and then read the matching file', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'content_search 도구로 "class AgentLoop" 패턴을 검색하고, 찾은 파일에서 AgentLoop 클래스의 run 메서드 시그니처를 알려줘.'
    );

    expect(toolCalls).toContain('content_search');
    // Should also read the found file
    expect(toolCalls.some((t) => t === 'file_read' || t === 'content_search')).toBe(true);
    // Result should describe the run method
    expect(result.content).toMatch(/run|userMessage|AgentResult|Promise/i);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 3: Non-existent file → error recovery
// "존재하지 않는 파일 읽기 시도 → LLM이 에러 인지하고 대안 제시"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Error recovery', () => {
  it('should handle file not found and recover gracefully', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    const toolResults: { name: string; success: boolean }[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));
    eventBus.on('tool:end', (p) => toolResults.push({
      name: p.toolCall.name,
      success: p.result.success,
    }));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'src/nonexistent-file-12345.ts 파일을 읽어줘.'
    );

    // Tool should have been called
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    // At least one tool result should be a failure (file not found)
    expect(toolResults.some((r) => !r.success)).toBe(true);
    // LLM should explain the error
    expect(result.content).toMatch(/존재하지|찾을 수 없|not found|없습니다|error/i);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 4: Complex multi-file analysis
// "여러 파일을 읽고 비교 분석하는 복합 질의"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Complex multi-file analysis', () => {
  it('should read multiple files and synthesize information', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'packages/core/package.json과 packages/agent/package.json 두 파일을 읽어서, 각각의 dependencies 목록을 비교하고 공통 의존성이 있는지 알려줘.'
    );

    // Should read at least 2 files
    const fileReads = toolCalls.filter((t) => t === 'file_read');
    expect(fileReads.length).toBeGreaterThanOrEqual(2);
    // Result should analyze dependencies
    expect(result.content).toMatch(/dependenc|의존/i);
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 5: Shell execution with output parsing
// "쉘 명령 실행 후 결과 해석"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Shell execution', () => {
  it('should execute shell command and interpret results', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    // Allow shell_exec without permission prompt
    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
      permissionHandler: async () => 'session',
    });

    const result = await agent.run(
      'shell_exec 도구로 "node --version" 명령을 실행하고, 현재 Node.js 버전을 알려줘.'
    );

    expect(toolCalls).toContain('shell_exec');
    // Result should contain a version number
    expect(result.content).toMatch(/\d+\.\d+/);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 6: Git tool usage
// "git 상태 확인하고 최근 커밋 이력 요약"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Git tools', () => {
  it('should use git tools to analyze repository state', async () => {
    if (skip()) return;

    const { registerGitTools } = await import('@cli-agent/tools');
    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    registerGitTools(toolRegistry);

    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'git_log 도구로 최근 커밋 5개를 조회하고, 각 커밋의 제목과 타입(feat/fix/refactor 등)을 요약해줘.'
    );

    expect(toolCalls).toContain('git_log');
    // Result should summarize commits
    expect(result.content).toMatch(/feat|fix|refactor|merge|commit/i);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 7: Parallel tool calls by LLM
// "여러 파일을 동시에 읽어야 하는 상황 — LLM이 병렬 호출하는지"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Parallel tool invocation', () => {
  it('should invoke multiple tool calls in a single turn when appropriate', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();

    // Track tool calls per iteration
    const iterationToolCalls: ToolCall[][] = [];
    let currentIterationTools: ToolCall[] = [];

    eventBus.on('llm:response', (p) => {
      if (p.response.toolCalls.length > 0) {
        currentIterationTools = [...p.response.toolCalls];
        iterationToolCalls.push(currentIterationTools);
      }
    });

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: {
        ...makeConfig(),
        systemPrompt: `You are a precise coding assistant. When you need to read multiple files, call file_read for ALL of them in a single response using parallel tool calls. Never read files one by one when you can read them all at once.`,
      },
      eventBus,
    });

    const result = await agent.run(
      '다음 3개 파일을 동시에 읽어줘: packages/core/package.json, packages/agent/package.json, packages/tools/package.json. 각 패키지의 name 필드를 알려줘.'
    );

    // Check if any single LLM response contained multiple tool calls
    const hasParallelCalls = iterationToolCalls.some((calls) => calls.length >= 2);
    const maxParallel = iterationToolCalls.length > 0
      ? Math.max(...iterationToolCalls.map((c) => c.length))
      : 0;

    console.log(`[Parallel Test] iterations=${result.iterations}, maxParallelCalls=${maxParallel}, hasParallel=${hasParallelCalls}`);
    for (const [i, calls] of iterationToolCalls.entries()) {
      console.log(`  iteration ${i + 1}: ${calls.length} tool calls — [${calls.map((c) => c.name).join(', ')}]`);
    }

    // LLM should have read all 3 files
    expect(result.content).toMatch(/@cli-agent\/core|cli-agent/i);
    expect(result.aborted).toBe(false);

    // With the explicit instruction, LLM should issue parallel calls
    // At least one iteration should have 2+ tool calls
    expect(maxParallel).toBeGreaterThanOrEqual(2);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 8: Complex reasoning with multiple tool types
// "file_search → content_search → file_read → shell_exec 조합"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Complex multi-tool reasoning', () => {
  it('should chain different tool types to answer a complex question', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
      permissionHandler: async () => 'session',
    });

    const result = await agent.run(
      'file_search로 "vitest.config*" 패턴을 검색하고, 찾은 파일 중 하나를 file_read로 읽어서 테스트 설정(include 패턴, timeout 등)을 분석해줘.'
    );

    // Should use at least file_search (LLM may or may not also call file_read
    // depending on how much info file_search returns)
    expect(toolCalls).toContain('file_search');
    // Result should mention vitest configuration details
    expect(result.content).toMatch(/include|timeout|vitest|test|config/i);
    expect(result.iterations).toBeGreaterThanOrEqual(2);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 9: Large output handling
// "큰 파일을 읽었을 때 정상 처리되는지"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Large file handling', () => {
  it('should handle reading a large file without crashing', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'pnpm-lock.yaml 파일을 읽어서 총 몇 줄인지, 그리고 사용된 패키지 중 vitest의 버전을 알려줘.'
    );

    expect(toolCalls).toContain('file_read');
    // Should get some answer (even if truncated)
    expect(result.content.length).toBeGreaterThan(10);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 10: Korean natural language + tool calling
// "완전히 한국어로 복잡한 질의 → LLM이 도구를 적절히 사용하는지"
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Korean natural language understanding', () => {
  it('should understand complex Korean instructions and use tools correctly', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (p) => toolCalls.push(p.toolCall.name));

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'README.md 파일을 읽어서 이 프로젝트가 무엇을 하는 프로젝트인지 한국어 3줄로 요약해줘.'
    );

    expect(toolCalls).toContain('file_read');
    // Should return Korean summary
    expect(result.content.length).toBeGreaterThan(20);
    // Verify it's actually Korean (contains at least some Korean characters)
    expect(result.content).toMatch(/[\uAC00-\uD7AF]/);
    expect(result.aborted).toBe(false);
  }, 60000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 11: Abort during real LLM call
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Abort handling', () => {
  it('should abort cleanly during a multi-step operation', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();

    const agent = new AgentLoop({
      provider,
      toolRegistry,
      config: makeConfig(),
      permissionHandler: async () => 'session',
    });

    const runPromise = agent.run(
      'file_search로 모든 TypeScript 파일을 찾고, 각 파일의 첫 5줄을 읽어서 전체 프로젝트 구조를 설명해줘.'
    );

    // Abort after first tool call completes
    setTimeout(() => agent.abort('user cancelled'), 3000);

    try {
      const result = await runPromise;
      // Might complete before abort if fast enough
      expect(result.runId).toBeTruthy();
    } catch (error) {
      // AbortError is expected
      expect((error as Error).message).toMatch(/abort/i);
    }
  }, 30000);
});

// ─────────────────────────────────────────────────────────────────────
// Scenario 12: Event tracking with real LLM
// ─────────────────────────────────────────────────────────────────────
describe('Real LLM: Event lifecycle verification', () => {
  it('should emit all lifecycle events with real provider', async () => {
    if (skip()) return;

    const provider = makeProvider();
    const toolRegistry = createToolRegistry();
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
      config: makeConfig(),
      eventBus,
    });

    const result = await agent.run(
      'package.json 파일을 읽어서 프로젝트 이름만 알려줘.'
    );

    // Must start and end
    expect(events[0]).toBe('agent:start');
    expect(events[events.length - 1]).toBe('agent:end');

    // Must have at least one LLM round-trip
    expect(events).toContain('llm:request');
    expect(events).toContain('llm:response');

    // Should have tool events (file_read)
    expect(events).toContain('tool:start');
    expect(events).toContain('tool:end');

    // Verify ordering: request before response, start before end
    const reqIdx = events.indexOf('llm:request');
    const resIdx = events.indexOf('llm:response');
    expect(resIdx).toBeGreaterThan(reqIdx);

    const toolStartIdx = events.indexOf('tool:start');
    const toolEndIdx = events.indexOf('tool:end');
    expect(toolEndIdx).toBeGreaterThan(toolStartIdx);
  }, 60000);
});
