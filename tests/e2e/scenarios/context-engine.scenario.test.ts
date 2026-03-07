/**
 * Scenario tests for @core/context-engine package.
 * Covers token estimation, budget tracking, tool filtering,
 * history compression, and full context assembly.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import type {
  ContextMessage,
  ToolDescriptionRef,
  ContextBudget,
  PinningStrategy,
} from '@core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string): ToolDescriptionRef {
  return {
    name,
    description: `${name} tool`,
    parameters: [
      { name: 'input', type: 'string', description: 'Input', required: true },
    ],
    tokenEstimate: 50,
  };
}

function makeMessage(
  role: ContextMessage['role'],
  content: string,
  overrides?: Partial<ContextMessage>,
): ContextMessage {
  return { role, content, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Token Estimation
// ---------------------------------------------------------------------------
describe('Token Estimation', () => {
  let estimateTokens: Awaited<typeof import('@core/context-engine')>['estimateTokens'];
  let estimateToolTokens: Awaited<typeof import('@core/context-engine')>['estimateToolTokens'];
  let estimateMessageTokens: Awaited<typeof import('@core/context-engine')>['estimateMessageTokens'];

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    estimateTokens = mod.estimateTokens;
    estimateToolTokens = mod.estimateToolTokens;
    estimateMessageTokens = mod.estimateMessageTokens;
  });

  it('should estimate tokens for a plain string using chars/4 heuristic', () => {
    const result = estimateTokens('hello world');
    // 'hello world' is 11 chars -> ceil(11/4) = 3
    expect(result).toBe(Math.ceil(11 / 4));
    expect(result).toBeGreaterThan(0);
  });

  it('should return 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate tokens for a complex tool definition and return > 0', () => {
    const tool: ToolDescriptionRef = {
      name: 'file_read',
      description: 'Read file contents from the filesystem',
      parameters: [
        { name: 'path', type: 'string', description: 'Absolute file path', required: true },
        { name: 'encoding', type: 'string', description: 'File encoding format', required: false },
      ],
      tokenEstimate: 80,
    };
    const result = estimateToolTokens(tool);
    expect(result).toBeGreaterThan(0);
  });

  it('should use pre-set tokenEstimate when available on a message', () => {
    const msg = makeMessage('user', 'some content', { tokenEstimate: 42 });
    expect(estimateMessageTokens(msg)).toBe(42);
  });

  it('should calculate tokens from content when tokenEstimate is not set', () => {
    const msg = makeMessage('user', 'Hello, this is a test message');
    const result = estimateMessageTokens(msg);
    // Should be based on content length / 4 + overhead (4)
    expect(result).toBeGreaterThan(0);
    expect(result).toBe(Math.ceil('Hello, this is a test message'.length / 4) + 4);
  });
});

// ---------------------------------------------------------------------------
// 2. ContextBudgetTracker - Budget Enforcement
// ---------------------------------------------------------------------------
describe('ContextBudgetTracker - Budget Enforcement', () => {
  let ContextBudgetTracker: Awaited<typeof import('@core/context-engine')>['ContextBudgetTracker'];

  const testBudget: ContextBudget = {
    totalLimit: 1000,
    reserveForResponse: 200,
    sections: { system: 300, tools: 200, history: 300 },
  };

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    ContextBudgetTracker = mod.ContextBudgetTracker;
  });

  it('should track addToSection and reflect usage correctly', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 100);

    const usage = tracker.usage();
    expect(usage.system.used).toBe(100);
    expect(usage.system.limit).toBe(300);
    expect(usage.system.percent).toBe(33); // Math.round(100/300*100)
  });

  it('should return true from wouldExceed when addition exceeds section limit', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 100);
    // 100 + 250 = 350 > 300
    expect(tracker.wouldExceed('system', 250)).toBe(true);
  });

  it('should return false from wouldExceed when addition fits within limit', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 100);
    // 100 + 150 = 250 <= 300
    expect(tracker.wouldExceed('system', 150)).toBe(false);
  });

  it('should track multiple sections independently', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 50);
    tracker.addToSection('tools', 80);
    tracker.addToSection('history', 120);

    const usage = tracker.usage();
    expect(usage.system.used).toBe(50);
    expect(usage.tools.used).toBe(80);
    expect(usage.history.used).toBe(120);
  });

  it('should compute total as the sum of all section usage', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 50);
    tracker.addToSection('tools', 80);
    tracker.addToSection('history', 120);

    const usage = tracker.usage();
    expect(usage.total).toBe(50 + 80 + 120);
  });

  it('should compute remaining as totalLimit - reserveForResponse - total', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 50);
    tracker.addToSection('tools', 80);
    tracker.addToSection('history', 120);

    const usage = tracker.usage();
    // 1000 - 200 - 250 = 550
    expect(usage.remaining).toBe(550);
  });

  it('should clear all usage on reset', () => {
    const tracker = new ContextBudgetTracker(testBudget);
    tracker.addToSection('system', 200);
    tracker.addToSection('tools', 150);
    tracker.addToSection('history', 100);

    tracker.reset();

    const usage = tracker.usage();
    expect(usage.system.used).toBe(0);
    expect(usage.tools.used).toBe(0);
    expect(usage.history.used).toBe(0);
    expect(usage.total).toBe(0);
    // remaining = 1000 - 200 - 0 = 800
    expect(usage.remaining).toBe(800);
  });
});

// ---------------------------------------------------------------------------
// 3. Tool Filtering - By Skill
// ---------------------------------------------------------------------------
describe('Tool Filtering - By Skill', () => {
  let filterToolsBySkill: Awaited<typeof import('@core/context-engine')>['filterToolsBySkill'];

  const allTools: ToolDescriptionRef[] = [
    makeTool('file_read'),
    makeTool('file_write'),
    makeTool('shell_exec'),
    makeTool('content_search'),
    makeTool('git_status'),
  ];

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    filterToolsBySkill = mod.filterToolsBySkill;
  });

  it('should return only tools matching the skill list', () => {
    const result = filterToolsBySkill(allTools, ['file_read', 'file_write']);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toEqual(['file_read', 'file_write']);
  });

  it('should return all tools when wildcard * is specified', () => {
    const result = filterToolsBySkill(allTools, ['*']);
    expect(result).toHaveLength(5);
  });

  it('should return empty array when skill list is empty', () => {
    const result = filterToolsBySkill(allTools, []);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Tool Filtering - By Profile
// ---------------------------------------------------------------------------
describe('Tool Filtering - By Profile', () => {
  let resolveToolAccess: Awaited<typeof import('@core/context-engine')>['resolveToolAccess'];
  let filterToolsByProfile: Awaited<typeof import('@core/context-engine')>['filterToolsByProfile'];

  const profile = {
    allowedTools: ['file_read', 'shell_exec'] as readonly string[],
    deniedTools: ['shell_exec'] as readonly string[],
    approvalRequired: [] as readonly string[],
  };

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    resolveToolAccess = mod.resolveToolAccess;
    filterToolsByProfile = mod.filterToolsByProfile;
  });

  it('should resolve allowed tool as allowed', () => {
    expect(resolveToolAccess('file_read', profile)).toBe('allowed');
  });

  it('should resolve denied tool as denied even if also in allowed list', () => {
    // shell_exec is in both allowedTools and deniedTools; denied takes priority
    expect(resolveToolAccess('shell_exec', profile)).toBe('denied');
  });

  it('should resolve unknown tool as denied', () => {
    expect(resolveToolAccess('unknown_tool', profile)).toBe('denied');
  });

  it('should filter out denied tools from the tool list', () => {
    const tools = [
      makeTool('file_read'),
      makeTool('shell_exec'),
      makeTool('unknown_tool'),
    ];
    const result = filterToolsByProfile(tools, profile);
    // Only file_read is allowed; shell_exec is denied, unknown_tool is denied
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('file_read');
  });

  it('should keep tools that require approval', () => {
    const profileWithApproval = {
      allowedTools: ['file_read'] as readonly string[],
      deniedTools: [] as readonly string[],
      approvalRequired: ['shell_exec'] as readonly string[],
    };
    const tools = [makeTool('file_read'), makeTool('shell_exec')];
    const result = filterToolsByProfile(tools, profileWithApproval);
    // Both should pass: file_read is allowed, shell_exec requires_approval (not denied)
    expect(result).toHaveLength(2);
    expect(resolveToolAccess('shell_exec', profileWithApproval)).toBe('requires_approval');
  });
});

// ---------------------------------------------------------------------------
// 5. HistoryCompressor - Pinning & Compression
// ---------------------------------------------------------------------------
describe('HistoryCompressor - Pinning & Compression', () => {
  let HistoryCompressor: Awaited<typeof import('@core/context-engine')>['HistoryCompressor'];

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    HistoryCompressor = mod.HistoryCompressor;
  });

  function buildMessages(): ContextMessage[] {
    const messages: ContextMessage[] = [];

    // 10 tool_result messages with substantial content
    for (let i = 0; i < 10; i++) {
      messages.push(
        makeMessage('tool_result', `Tool result number ${i}: ${'x'.repeat(100)}`, {
          toolName: `tool_${i}`,
          toolCallId: `call_${i}`,
        }),
      );
    }

    // 2 user messages
    messages.push(makeMessage('user', 'Please analyze the results above'));
    messages.push(makeMessage('user', 'And summarize your findings'));

    // 3 assistant messages
    messages.push(makeMessage('assistant', 'I have analyzed the tool results'));
    messages.push(makeMessage('assistant', 'Here are the key findings from the analysis'));
    messages.push(makeMessage('assistant', 'In conclusion, the results look good'));

    return messages;
  }

  it('should preserve pinned messages and summarize middle ones', () => {
    const strategy: PinningStrategy = {
      pinned: [
        { type: 'last_n_tool_results', n: 2, reason: 'Keep recent results' },
        { type: 'user_messages_last_n', n: 2, reason: 'Keep user messages' },
      ],
      summarizable: [
        { type: 'middle_tool_results', strategy: 'key_points_only' },
        { type: 'old_assistant_messages', strategy: 'key_points_only' },
      ],
    };

    const compressor = new HistoryCompressor(strategy);
    const messages = buildMessages();

    // Use a small max token budget to force compression
    const result = compressor.compress(messages, 50);

    expect(result.summarizedCount).toBeGreaterThan(0);
    expect(result.compressedTokens).toBeLessThan(result.originalTokens);
  });

  it('should not compress when messages already fit within budget', () => {
    const compressor = new HistoryCompressor();
    const messages = [
      makeMessage('user', 'Hello'),
      makeMessage('assistant', 'Hi'),
    ];

    // Very large budget — no compression needed
    const result = compressor.compress(messages, 100000);

    expect(result.summarizedCount).toBe(0);
    expect(result.compressedTokens).toBe(result.originalTokens);
    expect(result.messages).toHaveLength(2);
  });

  it('should pin error results when strategy includes error_results', () => {
    const strategy: PinningStrategy = {
      pinned: [
        { type: 'error_results', reason: 'Preserve errors' },
        { type: 'last_n_tool_results', n: 1, reason: 'Keep last result' },
      ],
      summarizable: [
        { type: 'middle_tool_results', strategy: 'key_points_only' },
      ],
    };

    const compressor = new HistoryCompressor(strategy);
    const messages: ContextMessage[] = [
      makeMessage('tool_result', 'Success: file read OK', { toolName: 'read' }),
      makeMessage('tool_result', 'Error: file not found', { toolName: 'read' }),
      makeMessage('tool_result', 'Success: completed', { toolName: 'exec' }),
    ];

    // Small budget to force compression
    const result = compressor.compress(messages, 10);

    // The error message and last tool result should be pinned
    const contents = result.messages.map((m) => m.content);
    const hasError = contents.some((c) => c.includes('Error: file not found'));
    const hasLast = contents.some((c) => c.includes('Success: completed'));
    expect(hasError).toBe(true);
    expect(hasLast).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. ContextAssembler - Full Assembly
// ---------------------------------------------------------------------------
describe('ContextAssembler - Full Assembly', () => {
  let ContextAssembler: Awaited<typeof import('@core/context-engine')>['ContextAssembler'];

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    ContextAssembler = mod.ContextAssembler;
  });

  it('should assemble context with system prompt, tools, and messages', () => {
    const budget: ContextBudget = {
      totalLimit: 100000,
      reserveForResponse: 4096,
      sections: { system: 4096, tools: 8192, history: 80000 },
    };

    const assembler = new ContextAssembler(budget);

    const result = assembler.assemble({
      systemPrompt: 'You are a helpful assistant.',
      tools: [makeTool('file_read'), makeTool('file_write'), makeTool('shell_exec')],
      messages: [
        makeMessage('user', 'Read the file'),
        makeMessage('assistant', 'I will read the file for you.'),
        makeMessage('tool_result', 'File contents here', { toolName: 'file_read' }),
        makeMessage('assistant', 'Here are the file contents.'),
        makeMessage('user', 'Thanks!'),
      ],
    });

    expect(result.systemPrompt).toBe('You are a helpful assistant.');
    expect(result.tools).toHaveLength(3);
    expect(result.messages.length).toBeGreaterThanOrEqual(5);
    expect(result.usage.system.used).toBeGreaterThan(0);
    expect(result.usage.tools.used).toBeGreaterThan(0);
    expect(result.usage.history.used).toBeGreaterThan(0);
    expect(result.usage.total).toBeGreaterThan(0);
    expect(result.wasCompressed).toBe(false);
  });

  it('should filter tools when skillTools is provided', () => {
    const budget: ContextBudget = {
      totalLimit: 100000,
      reserveForResponse: 4096,
      sections: { system: 4096, tools: 8192, history: 80000 },
    };

    const assembler = new ContextAssembler(budget);

    const result = assembler.assemble({
      systemPrompt: 'You are a helpful assistant.',
      tools: [makeTool('file_read'), makeTool('file_write'), makeTool('shell_exec')],
      messages: [makeMessage('user', 'Hello')],
      skillTools: ['file_read'],
    });

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('file_read');
  });
});

// ---------------------------------------------------------------------------
// 7. ContextAssembler - Over Budget Triggers Compression
// ---------------------------------------------------------------------------
describe('ContextAssembler - Over Budget Triggers Compression', () => {
  let ContextAssembler: Awaited<typeof import('@core/context-engine')>['ContextAssembler'];

  beforeEach(async () => {
    const mod = await import('@core/context-engine');
    ContextAssembler = mod.ContextAssembler;
  });

  it('should compress messages when history exceeds budget threshold', () => {
    // Very small budget to force compression
    const budget: ContextBudget = {
      totalLimit: 500,
      reserveForResponse: 50,
      sections: { system: 100, tools: 100, history: 200 },
    };

    const assembler = new ContextAssembler(budget);

    // Generate many large messages that will exceed history budget
    const messages: ContextMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(
        makeMessage('tool_result', `Result ${i}: ${'data '.repeat(50)}`, {
          toolName: `tool_${i}`,
          toolCallId: `call_${i}`,
        }),
      );
    }
    messages.push(makeMessage('user', 'Summarize all the results above'));

    const result = assembler.assemble({
      systemPrompt: 'You are a helpful assistant.',
      tools: [makeTool('file_read')],
      messages,
    });

    expect(result.wasCompressed).toBe(true);
    // Compressed messages should be fewer than the original 21
    expect(result.messages.length).toBeLessThan(messages.length);
  });
});

// ---------------------------------------------------------------------------
// 8. Budget Presets
// ---------------------------------------------------------------------------
describe('Budget Presets', () => {
  let BUDGET_PRESETS: Awaited<typeof import('@core/types')>['BUDGET_PRESETS'];

  beforeEach(async () => {
    const mod = await import('@core/types');
    BUDGET_PRESETS = mod.BUDGET_PRESETS;
  });

  it('should have SLLM_32K preset with reasonable values', () => {
    const preset = BUDGET_PRESETS.SLLM_32K;
    expect(preset.totalLimit).toBe(32768);
    expect(preset.reserveForResponse).toBeGreaterThan(0);
    expect(preset.sections.system).toBeGreaterThan(0);
    expect(preset.sections.tools).toBeGreaterThan(0);
    expect(preset.sections.history).toBeGreaterThan(0);
  });

  it('should have LLM_128K preset with larger values than SLLM_32K', () => {
    const preset = BUDGET_PRESETS.LLM_128K;
    expect(preset.totalLimit).toBe(131072);
    expect(preset.totalLimit).toBeGreaterThan(BUDGET_PRESETS.SLLM_32K.totalLimit);
    expect(preset.sections.history).toBeGreaterThan(BUDGET_PRESETS.SLLM_32K.sections.history);
  });

  it('should have LLM_200K preset with the largest values', () => {
    const preset = BUDGET_PRESETS.LLM_200K;
    expect(preset.totalLimit).toBe(204800);
    expect(preset.totalLimit).toBeGreaterThan(BUDGET_PRESETS.LLM_128K.totalLimit);
    expect(preset.sections.history).toBeGreaterThan(BUDGET_PRESETS.LLM_128K.sections.history);
  });

  it('should have all required fields in every preset', () => {
    for (const key of ['SLLM_32K', 'LLM_128K', 'LLM_200K'] as const) {
      const preset = BUDGET_PRESETS[key];
      expect(preset).toHaveProperty('totalLimit');
      expect(preset).toHaveProperty('reserveForResponse');
      expect(preset).toHaveProperty('sections');
      expect(preset.sections).toHaveProperty('system');
      expect(preset.sections).toHaveProperty('tools');
      expect(preset.sections).toHaveProperty('history');
    }
  });
});
