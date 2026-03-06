import { describe, it, expect } from 'vitest';
import { ContextAssembler } from '../src/context-assembler.js';
import type {
  ContextBudget,
  ContextMessage,
  ToolDescriptionRef,
} from '@core/types';

function makeTool(name: string): ToolDescriptionRef {
  return {
    name,
    description: `Tool ${name}`,
    parameters: [
      { name: 'input', type: 'string', description: 'Input param', required: true },
    ],
    tokenEstimate: 20,
  };
}

function makeMessage(
  role: ContextMessage['role'],
  content: string,
  extras?: Partial<ContextMessage>,
): ContextMessage {
  return { role, content, ...extras };
}

const SMALL_BUDGET: ContextBudget = {
  totalLimit: 1000,
  reserveForResponse: 200,
  sections: {
    system: 100,
    tools: 200,
    history: 500,
  },
};

const LARGE_BUDGET: ContextBudget = {
  totalLimit: 32768,
  reserveForResponse: 4096,
  sections: {
    system: 2048,
    tools: 3072,
    history: 23552,
  },
};

describe('ContextAssembler', () => {
  it('should assemble context without compression when within budget', () => {
    const assembler = new ContextAssembler(LARGE_BUDGET);
    const messages: ContextMessage[] = [
      makeMessage('user', 'Hello'),
      makeMessage('assistant', 'Hi there'),
    ];

    const result = assembler.assemble({
      systemPrompt: 'You are a helpful assistant.',
      tools: [makeTool('readFile')],
      messages,
    });

    expect(result.wasCompressed).toBe(false);
    expect(result.messages).toEqual(messages);
    expect(result.systemPrompt).toBe('You are a helpful assistant.');
    expect(result.tools).toHaveLength(1);
    expect(result.usage.total).toBeGreaterThan(0);
    expect(result.usage.remaining).toBeGreaterThan(0);
  });

  it('should filter tools by skill when skillTools provided', () => {
    const assembler = new ContextAssembler(LARGE_BUDGET);
    const tools = [makeTool('readFile'), makeTool('writeFile'), makeTool('deploy')];

    const result = assembler.assemble({
      systemPrompt: 'Test',
      tools,
      messages: [],
      skillTools: ['readFile', 'deploy'],
    });

    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name)).toEqual(['readFile', 'deploy']);
  });

  it('should compress history when exceeding 80% of history budget', () => {
    const assembler = new ContextAssembler(SMALL_BUDGET);

    // Create messages that exceed 80% of 500 = 400 tokens
    // Each message ~100+ chars => ~25+ tokens + overhead
    const messages: ContextMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(
        makeMessage('tool_result', `Result data number ${i}: ${'x'.repeat(100)}`, {
          toolName: `tool${i}`,
        }),
      );
    }
    messages.push(makeMessage('user', 'What happened?'));
    messages.push(makeMessage('user', 'Tell me more'));

    const result = assembler.assemble({
      systemPrompt: 'Sys',
      tools: [],
      messages,
    });

    expect(result.wasCompressed).toBe(true);
    // Should have fewer messages after compression
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it('should track usage across all sections', () => {
    const assembler = new ContextAssembler(LARGE_BUDGET);

    const result = assembler.assemble({
      systemPrompt: 'System prompt text here',
      tools: [makeTool('search'), makeTool('readFile')],
      messages: [makeMessage('user', 'Find something')],
    });

    expect(result.usage.system.used).toBeGreaterThan(0);
    expect(result.usage.tools.used).toBeGreaterThan(0);
    expect(result.usage.history.used).toBeGreaterThan(0);
    expect(result.usage.system.limit).toBe(2048);
    expect(result.usage.tools.limit).toBe(3072);
    expect(result.usage.history.limit).toBe(23552);
  });

  it('should pass all tools when no skillTools specified', () => {
    const assembler = new ContextAssembler(LARGE_BUDGET);
    const tools = [makeTool('a'), makeTool('b'), makeTool('c')];

    const result = assembler.assemble({
      systemPrompt: 'Test',
      tools,
      messages: [],
    });

    expect(result.tools).toHaveLength(3);
  });

  it('should handle empty messages', () => {
    const assembler = new ContextAssembler(LARGE_BUDGET);

    const result = assembler.assemble({
      systemPrompt: 'Test',
      tools: [],
      messages: [],
    });

    expect(result.wasCompressed).toBe(false);
    expect(result.messages).toEqual([]);
    expect(result.usage.history.used).toBe(0);
  });

  it('should use custom pinning strategy when provided', () => {
    const customStrategy = {
      pinned: [
        { type: 'last_n_tool_results' as const, n: 1, reason: 'Keep only last' },
      ],
      summarizable: [
        { type: 'middle_tool_results' as const, strategy: 'key_points_only' as const },
      ],
    };

    const assembler = new ContextAssembler(SMALL_BUDGET, customStrategy);

    const messages: ContextMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(
        makeMessage('tool_result', `Result ${'y'.repeat(100)}`, {
          toolName: `tool${i}`,
        }),
      );
    }

    const result = assembler.assemble({
      systemPrompt: 'Sys',
      tools: [],
      messages,
    });

    expect(result.wasCompressed).toBe(true);
  });
});
