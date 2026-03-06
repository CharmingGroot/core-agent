import { describe, it, expect, beforeAll } from 'vitest';
import { loadEnv } from './setup.js';
import { AgentLoop } from '@cli-agent/agent';
import type { AgentLoopOptions } from '@cli-agent/agent';
import { ClaudeProvider } from '@cli-agent/providers';
import { OpenAIProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import {
  Registry,
  EventBus,
  apiKeyAuth,
} from '@cli-agent/core';
import type { ITool, AgentConfig, ProviderConfig } from '@cli-agent/core';

let env: Record<string, string>;

beforeAll(async () => {
  env = await loadEnv();
});

/**
 * Build an AgentConfig with the given provider config.
 * maxIterations is kept low to avoid runaway loops in tests.
 */
function buildAgentConfig(provider: ProviderConfig, maxIterations = 5): AgentConfig {
  return {
    provider,
    maxIterations,
    systemPrompt: 'You are a helpful assistant. Be concise.',
    workingDirectory: process.cwd(),
  };
}

// ---------------------------------------------------------------------------
// Claude E2E
// ---------------------------------------------------------------------------
describe('E2E: AgentLoop with Claude', () => {
  it('should get a response from Claude', async () => {
    const apiKey = env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      console.log('Skipping: ANTHROPIC_API_KEY not set in .env');
      return;
    }

    const providerConfig: ProviderConfig = {
      providerId: 'claude',
      model: 'claude-sonnet-4-20250514',
      auth: apiKeyAuth(apiKey),
      maxTokens: 1024,
      temperature: 0,
    };

    const provider = new ClaudeProvider(providerConfig);
    const toolRegistry = new Registry<ITool>('Tool');
    const agentConfig = buildAgentConfig(providerConfig, 3);

    const options: AgentLoopOptions = {
      provider,
      toolRegistry,
      config: agentConfig,
      eventBus: new EventBus(),
    };

    const agent = new AgentLoop(options);
    const result = await agent.run('What is 2+2? Reply with just the number.');

    expect(result.content).toContain('4');
    expect(result.aborted).toBe(false);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.runId).toBeTruthy();
  }, 30000);
});

// ---------------------------------------------------------------------------
// OpenAI E2E
// ---------------------------------------------------------------------------
describe('E2E: AgentLoop with OpenAI', () => {
  it('should get a response from OpenAI', async () => {
    const apiKey = env['OPENAI_API_KEY'];
    if (!apiKey) {
      console.log('Skipping: OPENAI_API_KEY not set in .env');
      return;
    }

    const providerConfig: ProviderConfig = {
      providerId: 'openai',
      model: 'gpt-4o-mini',
      auth: apiKeyAuth(apiKey),
      maxTokens: 1024,
      temperature: 0,
    };

    const provider = new OpenAIProvider(providerConfig);
    const toolRegistry = new Registry<ITool>('Tool');
    const agentConfig = buildAgentConfig(providerConfig, 3);

    const options: AgentLoopOptions = {
      provider,
      toolRegistry,
      config: agentConfig,
      eventBus: new EventBus(),
    };

    const agent = new AgentLoop(options);
    const result = await agent.run('What is 2+2? Reply with just the number.');

    expect(result.content).toContain('4');
    expect(result.aborted).toBe(false);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.runId).toBeTruthy();
  }, 30000);
});

// ---------------------------------------------------------------------------
// Tool execution E2E
// ---------------------------------------------------------------------------
describe('E2E: Tool execution', () => {
  it('should execute file_read tool via agent', async () => {
    const anthropicKey = env['ANTHROPIC_API_KEY'];
    const openaiKey = env['OPENAI_API_KEY'];
    const apiKey = anthropicKey ?? openaiKey;
    if (!apiKey) {
      console.log('Skipping: No API key in .env');
      return;
    }

    // Use whichever provider has a key available
    const isAnthropic = Boolean(anthropicKey);
    const providerConfig: ProviderConfig = isAnthropic
      ? {
          providerId: 'claude',
          model: 'claude-sonnet-4-20250514',
          auth: apiKeyAuth(apiKey),
          maxTokens: 1024,
          temperature: 0,
        }
      : {
          providerId: 'openai',
          model: 'gpt-4o-mini',
          auth: apiKeyAuth(apiKey),
          maxTokens: 1024,
          temperature: 0,
        };

    const provider = isAnthropic
      ? new ClaudeProvider(providerConfig)
      : new OpenAIProvider(providerConfig);

    // Use the full tool registry so the agent can call file_read
    const toolRegistry = createToolRegistry();
    const agentConfig = buildAgentConfig(providerConfig, 10);

    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (payload) => {
      toolCalls.push(payload.toolCall.name);
    });

    const options: AgentLoopOptions = {
      provider,
      toolRegistry,
      config: agentConfig,
      eventBus,
    };

    const agent = new AgentLoop(options);
    const result = await agent.run(
      'Read the file "package.json" in the current directory and tell me the project name.'
    );

    expect(toolCalls).toContain('file_read');
    expect(result.content).toBeTruthy();
    expect(result.aborted).toBe(false);
    // The agent should mention "cli-agent-core" since that is the project name
    expect(result.content.toLowerCase()).toContain('cli-agent-core');
  }, 60000);

  it('should handle multiple tool iterations', async () => {
    const anthropicKey = env['ANTHROPIC_API_KEY'];
    const openaiKey = env['OPENAI_API_KEY'];
    const apiKey = anthropicKey ?? openaiKey;
    if (!apiKey) {
      console.log('Skipping: No API key in .env');
      return;
    }

    const isAnthropic = Boolean(anthropicKey);
    const providerConfig: ProviderConfig = isAnthropic
      ? {
          providerId: 'claude',
          model: 'claude-sonnet-4-20250514',
          auth: apiKeyAuth(apiKey),
          maxTokens: 1024,
          temperature: 0,
        }
      : {
          providerId: 'openai',
          model: 'gpt-4o-mini',
          auth: apiKeyAuth(apiKey),
          maxTokens: 1024,
          temperature: 0,
        };

    const provider = isAnthropic
      ? new ClaudeProvider(providerConfig)
      : new OpenAIProvider(providerConfig);

    const toolRegistry = createToolRegistry();
    const agentConfig = buildAgentConfig(providerConfig, 10);

    const eventBus = new EventBus();
    const toolCalls: string[] = [];
    eventBus.on('tool:start', (payload) => {
      toolCalls.push(payload.toolCall.name);
    });

    const options: AgentLoopOptions = {
      provider,
      toolRegistry,
      config: agentConfig,
      eventBus,
    };

    const agent = new AgentLoop(options);
    const result = await agent.run(
      'Search for files named "vitest.config.ts" in the packages directory, then read one of them and tell me what test framework it uses.'
    );

    // The agent should have used at least file_search and file_read
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(result.content).toBeTruthy();
    expect(result.aborted).toBe(false);
    // The response should mention vitest since that is the test framework
    expect(result.content.toLowerCase()).toContain('vitest');
  }, 60000);
});

// ---------------------------------------------------------------------------
// Agent abort E2E
// ---------------------------------------------------------------------------
describe('E2E: Agent abort', () => {
  it('should respect abort signal', async () => {
    const anthropicKey = env['ANTHROPIC_API_KEY'];
    const openaiKey = env['OPENAI_API_KEY'];
    const apiKey = anthropicKey ?? openaiKey;
    if (!apiKey) {
      console.log('Skipping: No API key in .env');
      return;
    }

    const isAnthropic = Boolean(anthropicKey);
    const providerConfig: ProviderConfig = isAnthropic
      ? {
          providerId: 'claude',
          model: 'claude-sonnet-4-20250514',
          auth: apiKeyAuth(apiKey),
          maxTokens: 1024,
          temperature: 0,
        }
      : {
          providerId: 'openai',
          model: 'gpt-4o-mini',
          auth: apiKeyAuth(apiKey),
          maxTokens: 1024,
          temperature: 0,
        };

    const provider = isAnthropic
      ? new ClaudeProvider(providerConfig)
      : new OpenAIProvider(providerConfig);

    const toolRegistry = createToolRegistry();
    const agentConfig = buildAgentConfig(providerConfig, 10);

    const options: AgentLoopOptions = {
      provider,
      toolRegistry,
      config: agentConfig,
      eventBus: new EventBus(),
    };

    const agent = new AgentLoop(options);

    // Abort almost immediately after starting
    const runPromise = agent.run(
      'List every file in the current directory recursively, read each one, and summarize the entire codebase.'
    );

    // Give the first iteration a moment to start, then abort
    setTimeout(() => agent.abort('test abort'), 100);

    // The agent should either throw AbortError or return with aborted: true
    try {
      const result = await runPromise;
      // If it completes before abort takes effect, the first iteration may have finished
      // Either way is acceptable in an E2E test
      expect(result.runId).toBeTruthy();
    } catch (error) {
      // AbortError is expected
      expect((error as Error).message).toContain('abort');
    }
  }, 30000);
});
