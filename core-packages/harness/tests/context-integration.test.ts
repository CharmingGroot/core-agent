import { describe, it, expect, vi } from 'vitest';
import { Registry, EventBus, RunContext } from '@cli-agent/core';
import type { ITool, ToolDescription, JsonObject } from '@cli-agent/core';
import type { ToolResult } from '@cli-agent/core';
import type { AssembledContext, ContextBudget, SectionUsage } from '@core/types';
import { createContextAwareBuilder } from '../src/context-integration.js';

// ── Mock tool ──────────────────────────────────────────────────────

function makeTool(name: string, desc: string): ITool {
  return {
    name,
    requiresPermission: false,
    describe(): ToolDescription {
      return {
        name,
        description: desc,
        parameters: [
          { name: 'input', type: 'string', description: 'The input', required: true },
        ],
      };
    },
    async execute(_params: JsonObject, _ctx: RunContext): Promise<ToolResult> {
      return { success: true, output: 'ok' };
    },
  };
}

// ── Mock ContextAssembler ──────────────────────────────────────────

function createMockAssembler() {
  const mockUsage: SectionUsage = {
    system: { used: 100, limit: 4096, percent: 2.4 },
    tools: { used: 200, limit: 8192, percent: 2.4 },
    history: { used: 0, limit: 110592, percent: 0 },
    total: 300,
    remaining: 130772,
  };

  const assembleFn = vi.fn((params: { systemPrompt: string; tools: readonly unknown[]; messages: readonly unknown[] }): AssembledContext => ({
    systemPrompt: params.systemPrompt,
    tools: params.tools as AssembledContext['tools'],
    messages: [],
    usage: mockUsage,
    wasCompressed: false,
  }));

  return {
    assemble: assembleFn,
    _mockUsage: mockUsage,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('createContextAwareBuilder', () => {
  it('should return the system prompt from assembler', async () => {
    const assembler = createMockAssembler();
    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('read', makeTool('read', 'Reads files'));

    const builder = createContextAwareBuilder({
      assembler: assembler as unknown as Parameters<typeof createContextAwareBuilder>[0]['assembler'],
      basePrompt: 'You are a helpful assistant.',
      toolRegistry,
    });

    const config = { provider: { providerId: 'test', model: 'test', auth: { type: 'no-auth' as const }, maxTokens: 1024, temperature: 0 }, maxIterations: 5, systemPrompt: '', workingDirectory: '/tmp' };
    const context = new RunContext(config, new EventBus());

    const result = await builder(context);
    expect(result).toBe('You are a helpful assistant.');
    expect(assembler.assemble).toHaveBeenCalledTimes(1);
  });

  it('should pass tool descriptions to assembler', async () => {
    const assembler = createMockAssembler();
    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('read', makeTool('read', 'Reads files'));
    toolRegistry.register('write', makeTool('write', 'Writes files'));

    const builder = createContextAwareBuilder({
      assembler: assembler as unknown as Parameters<typeof createContextAwareBuilder>[0]['assembler'],
      basePrompt: 'Base prompt',
      toolRegistry,
    });

    const config = { provider: { providerId: 'test', model: 'test', auth: { type: 'no-auth' as const }, maxTokens: 1024, temperature: 0 }, maxIterations: 5, systemPrompt: '', workingDirectory: '/tmp' };
    const context = new RunContext(config, new EventBus());
    await builder(context);

    const callArgs = assembler.assemble.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(2);
    expect(callArgs.tools[0].name).toBe('read');
    expect(callArgs.tools[1].name).toBe('write');
    expect(callArgs.tools[0].parameters).toHaveLength(1);
    expect(callArgs.tools[0].tokenEstimate).toBeGreaterThan(0);
  });

  it('should emit context:assembled event when eventBus provided', async () => {
    const assembler = createMockAssembler();
    const toolRegistry = new Registry<ITool>('Tool');
    const eventBus = new EventBus();
    const events: unknown[] = [];
    eventBus.on('context:assembled', (e) => events.push(e));

    const builder = createContextAwareBuilder({
      assembler: assembler as unknown as Parameters<typeof createContextAwareBuilder>[0]['assembler'],
      basePrompt: 'Prompt',
      toolRegistry,
      eventBus,
    });

    const config = { provider: { providerId: 'test', model: 'test', auth: { type: 'no-auth' as const }, maxTokens: 1024, temperature: 0 }, maxIterations: 5, systemPrompt: '', workingDirectory: '/tmp' };
    const context = new RunContext(config, eventBus);
    await builder(context);

    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev.runId).toBe(context.runId);
    expect(ev.wasCompressed).toBe(false);
    expect(ev.toolCount).toBe(0);
  });

  it('should use promptEnricher when provided', async () => {
    const assembler = createMockAssembler();
    const toolRegistry = new Registry<ITool>('Tool');

    const builder = createContextAwareBuilder({
      assembler: assembler as unknown as Parameters<typeof createContextAwareBuilder>[0]['assembler'],
      basePrompt: 'Ignored base',
      toolRegistry,
      promptEnricher: async (_ctx) => 'Enriched prompt with dynamic data',
    });

    const config = { provider: { providerId: 'test', model: 'test', auth: { type: 'no-auth' as const }, maxTokens: 1024, temperature: 0 }, maxIterations: 5, systemPrompt: '', workingDirectory: '/tmp' };
    const context = new RunContext(config, new EventBus());
    const result = await builder(context);

    expect(result).toBe('Enriched prompt with dynamic data');
    expect(assembler.assemble.mock.calls[0][0].systemPrompt).toBe('Enriched prompt with dynamic data');
  });

  it('should pass skillTools to assembler when provided', async () => {
    const assembler = createMockAssembler();
    const toolRegistry = new Registry<ITool>('Tool');
    toolRegistry.register('read', makeTool('read', 'Reads'));
    toolRegistry.register('write', makeTool('write', 'Writes'));

    const builder = createContextAwareBuilder({
      assembler: assembler as unknown as Parameters<typeof createContextAwareBuilder>[0]['assembler'],
      basePrompt: 'Prompt',
      toolRegistry,
      skillTools: ['read'],
    });

    const config = { provider: { providerId: 'test', model: 'test', auth: { type: 'no-auth' as const }, maxTokens: 1024, temperature: 0 }, maxIterations: 5, systemPrompt: '', workingDirectory: '/tmp' };
    const context = new RunContext(config, new EventBus());
    await builder(context);

    const callArgs = assembler.assemble.mock.calls[0][0];
    expect(callArgs.skillTools).toEqual(['read']);
  });
});
