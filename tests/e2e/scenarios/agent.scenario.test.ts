/**
 * Agent Package — Detailed Scenario Tests
 *
 * Covers: MessageManager, ToolDispatcher, PermissionManager, SessionManager
 * All imports use dynamic `await import(...)` to match alias resolution.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal AgentConfig that satisfies RunContext constructor */
function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: {
      providerId: 'test',
      model: 'test-model',
      auth: { type: 'no-auth' as const },
      maxTokens: 4096,
      temperature: 0.7,
    },
    maxIterations: 50,
    workingDirectory: process.cwd(),
    ...overrides,
  };
}

/** Creates a mock ITool for testing */
function createMockTool(
  name: string,
  opts: {
    requiresPermission?: boolean;
    executeFn?: (params: Record<string, unknown>) => Promise<{ success: boolean; output: string; error?: string }>;
    description?: string;
  } = {},
) {
  const {
    requiresPermission = false,
    description = `Mock tool: ${name}`,
  } = opts;

  const executeFn = opts.executeFn ?? (async () => ({
    success: true,
    output: `${name} executed`,
  }));

  return {
    name,
    requiresPermission,
    describe: () => ({
      name,
      description,
      parameters: [
        { name: 'input', type: 'string', description: 'Test input', required: false },
      ],
    }),
    execute: vi.fn(executeFn),
  };
}

// ---------------------------------------------------------------------------
// 1. MessageManager — Full Conversation Flow
// ---------------------------------------------------------------------------

describe('MessageManager — Full Conversation Flow', () => {
  it('should build a multi-turn conversation with correct ordering and count', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const mm = new MessageManager();

    mm.addSystemMessage('You are a helpful assistant.');
    mm.addUserMessage('Hello');
    mm.addAssistantMessage('Hi there!', [
      { id: 'tc-1', name: 'greet', arguments: '{"who":"user"}' },
    ]);

    const toolResults = new Map([
      ['tc-1', { success: true, output: 'Greeted user' }],
    ]);
    mm.addToolResults(toolResults);
    mm.addAssistantMessage('Done greeting.');

    const msgs = mm.getMessages();
    expect(msgs).toHaveLength(5);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[2].role).toBe('assistant');
    expect(msgs[2].toolCalls).toHaveLength(1);
    expect(msgs[3].role).toBe('user'); // tool results come as user message
    expect(msgs[3].toolResults).toHaveLength(1);
    expect(msgs[3].toolResults![0].toolCallId).toBe('tc-1');
    expect(msgs[4].role).toBe('assistant');
    expect(mm.messageCount).toBe(5);
  });

  it('should round-trip via serialize() and restore()', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const original = new MessageManager();
    original.addSystemMessage('sys');
    original.addUserMessage('u1');
    original.addAssistantMessage('a1');

    const json = original.serialize();
    const restored = new MessageManager();
    restored.restore(json);

    expect(restored.getMessages()).toEqual(original.getMessages());
    expect(restored.messageCount).toBe(3);
  });

  it('should reset to empty on clear()', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const mm = new MessageManager();
    mm.addUserMessage('msg');
    expect(mm.messageCount).toBe(1);

    mm.clear();
    expect(mm.messageCount).toBe(0);
    expect(mm.getMessages()).toEqual([]);
  });

  it('should replace the previous system message via setSystemMessage()', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const mm = new MessageManager();
    mm.addSystemMessage('old system prompt');
    mm.addUserMessage('hello');
    mm.setSystemMessage('new system prompt');

    const msgs = mm.getMessages();
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('new system prompt');
    // should still only have 2 messages, not 3
    expect(mm.messageCount).toBe(2);
  });

  it('should insert system message at position 0 if none exists', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const mm = new MessageManager();
    mm.addUserMessage('hello');
    mm.setSystemMessage('injected system');

    const msgs = mm.getMessages();
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('injected system');
    expect(msgs[1].role).toBe('user');
  });

  it('should return the most recent message via getLastMessage()', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const mm = new MessageManager();
    expect(mm.getLastMessage()).toBeUndefined();

    mm.addUserMessage('first');
    mm.addAssistantMessage('second');
    expect(mm.getLastMessage()?.content).toBe('second');
    expect(mm.getLastMessage()?.role).toBe('assistant');
  });

  it('should compress when over token limit (small maxHistoryTokens)', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    // Use a very small token limit to force compression
    const mm = new MessageManager(100);
    mm.addSystemMessage('system');

    // Add enough messages to exceed the budget
    for (let i = 0; i < 20; i++) {
      mm.addUserMessage(`User message number ${i} with some padding text to increase token count significantly.`);
      mm.addAssistantMessage(`Assistant reply number ${i} also padded with extra content to inflate size.`);
    }

    const beforeCount = mm.messageCount;
    const compressed = mm.compressIfNeeded();

    expect(compressed).toBeGreaterThan(0);
    expect(mm.messageCount).toBeLessThan(beforeCount);

    // System message should be preserved
    const msgs = mm.getMessages();
    expect(msgs[0].role).toBe('system');

    // A summary message should be present
    const summaryMsg = msgs.find(m => m.content.includes('[Conversation summary'));
    expect(summaryMsg).toBeDefined();
  });

  it('should not compress when under token limit', async () => {
    const { MessageManager } = await import('@cli-agent/agent');

    const mm = new MessageManager(100_000);
    mm.addUserMessage('short');
    mm.addAssistantMessage('reply');

    const compressed = mm.compressIfNeeded();
    expect(compressed).toBe(0);
    expect(mm.messageCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. ToolDispatcher — Dispatch & Error Handling
// ---------------------------------------------------------------------------

describe('ToolDispatcher — Dispatch & Error Handling', () => {
  let Registry: typeof import('@cli-agent/core').Registry;
  let RunContext: typeof import('@cli-agent/core').RunContext;
  let ToolDispatcher: typeof import('@cli-agent/agent').ToolDispatcher;
  let PermissionManager: typeof import('@cli-agent/agent').PermissionManager;
  let PermissionDeniedError: typeof import('@cli-agent/core').PermissionDeniedError;

  beforeEach(async () => {
    const core = await import('@cli-agent/core');
    const agent = await import('@cli-agent/agent');
    Registry = core.Registry;
    RunContext = core.RunContext;
    ToolDispatcher = agent.ToolDispatcher;
    PermissionManager = agent.PermissionManager;
    PermissionDeniedError = core.PermissionDeniedError;
  });

  it('should dispatch a tool call and return a successful result', async () => {
    const registry = new Registry<import('@cli-agent/core').ITool>('tools');
    const mockTool = createMockTool('echo', {
      executeFn: async (params) => ({
        success: true,
        output: `echo: ${JSON.stringify(params)}`,
      }),
    });
    registry.register('echo', mockTool);

    const pm = new PermissionManager();
    const dispatcher = new ToolDispatcher(registry, pm);
    const ctx = new RunContext(makeConfig());

    const result = await dispatcher.dispatch(
      { id: 'call-1', name: 'echo', arguments: '{"input":"hi"}' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('hi');
    expect(mockTool.execute).toHaveBeenCalledOnce();
  });

  it('should return error ToolResult for unknown tool', async () => {
    const registry = new Registry<import('@cli-agent/core').ITool>('tools');
    const pm = new PermissionManager();
    const dispatcher = new ToolDispatcher(registry, pm);
    const ctx = new RunContext(makeConfig());

    const result = await dispatcher.dispatch(
      { id: 'call-x', name: 'nonexistent', arguments: '{}' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('should dispatch multiple tool calls in parallel via dispatchAll', async () => {
    const registry = new Registry<import('@cli-agent/core').ITool>('tools');
    const toolA = createMockTool('toolA');
    const toolB = createMockTool('toolB');
    registry.register('toolA', toolA);
    registry.register('toolB', toolB);

    const pm = new PermissionManager();
    const dispatcher = new ToolDispatcher(registry, pm);
    const ctx = new RunContext(makeConfig());

    const calls = [
      { id: 'c1', name: 'toolA', arguments: '{}' },
      { id: 'c2', name: 'toolB', arguments: '{}' },
    ] as const;

    const results = await dispatcher.dispatchAll(calls, ctx);

    expect(results.size).toBe(2);
    expect(results.get('c1')?.success).toBe(true);
    expect(results.get('c2')?.success).toBe(true);
    expect(toolA.execute).toHaveBeenCalledOnce();
    expect(toolB.execute).toHaveBeenCalledOnce();
  });

  it('should return descriptions from all registered tools', async () => {
    const registry = new Registry<import('@cli-agent/core').ITool>('tools');
    registry.register('alpha', createMockTool('alpha', { description: 'Alpha tool' }));
    registry.register('beta', createMockTool('beta', { description: 'Beta tool' }));

    const pm = new PermissionManager();
    const dispatcher = new ToolDispatcher(registry, pm);

    const descriptions = dispatcher.getToolDescriptions();
    expect(descriptions).toHaveLength(2);

    const names = descriptions.map(d => d.name);
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(descriptions.find(d => d.name === 'alpha')?.description).toBe('Alpha tool');
  });

  it('should return failure ToolResult when tool.execute throws', async () => {
    const registry = new Registry<import('@cli-agent/core').ITool>('tools');
    const failTool = createMockTool('fail', {
      executeFn: async () => { throw new Error('boom'); },
    });
    registry.register('fail', failTool);

    const pm = new PermissionManager();
    const dispatcher = new ToolDispatcher(registry, pm);
    const ctx = new RunContext(makeConfig());

    const result = await dispatcher.dispatch(
      { id: 'call-fail', name: 'fail', arguments: '{}' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('should throw PermissionDeniedError when permission is denied', async () => {
    const registry = new Registry<import('@cli-agent/core').ITool>('tools');
    const restrictedTool = createMockTool('restricted', {
      requiresPermission: true,
    });
    registry.register('restricted', restrictedTool);

    const handler = vi.fn(async () => 'deny' as const);
    const pm = new PermissionManager(handler);
    const dispatcher = new ToolDispatcher(registry, pm);
    const ctx = new RunContext(makeConfig());

    await expect(
      dispatcher.dispatch(
        { id: 'call-denied', name: 'restricted', arguments: '{}' },
        ctx,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });
});

// ---------------------------------------------------------------------------
// 3. PermissionManager — Approval Level Transitions
// ---------------------------------------------------------------------------

describe('PermissionManager — Approval Level Transitions', () => {
  /** Builds a minimal ITool stub for permission checks */
  function permTool(name: string, requiresPermission = true) {
    return {
      name,
      requiresPermission,
      describe: () => ({ name, description: '', parameters: [] }),
      execute: vi.fn(async () => ({ success: true, output: '' })),
    };
  }

  it('should allow all tools by default (no handler)', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const pm = new PermissionManager();
    const tool = permTool('anything');
    const allowed = await pm.checkPermission(tool, { path: '/tmp' });
    expect(allowed).toBe(true);
  });

  it('should cache session-level approval (handler called once)', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const handler = vi.fn(async () => 'session' as const);
    const pm = new PermissionManager(handler);
    const tool = permTool('write-file');

    expect(await pm.checkPermission(tool)).toBe(true);
    expect(await pm.checkPermission(tool)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1); // cached after first call
  });

  it('should not cache once-level approval (handler called every time)', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const handler = vi.fn(async () => 'once' as const);
    const pm = new PermissionManager(handler);
    const tool = permTool('dangerous-op');

    expect(await pm.checkPermission(tool)).toBe(true);
    expect(await pm.checkPermission(tool)).toBe(true);
    expect(await pm.checkPermission(tool)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(3); // called every time
  });

  it('should cache always-level approval and call onPersist', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const handler = vi.fn(async () => 'always' as const);
    const onPersist = vi.fn();
    const pm = new PermissionManager(handler, onPersist);
    const tool = permTool('shell');

    expect(await pm.checkPermission(tool)).toBe(true);
    expect(await pm.checkPermission(tool)).toBe(true);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(onPersist).toHaveBeenCalledWith('shell');
    expect(onPersist).toHaveBeenCalledTimes(1);
  });

  it('should return false when handler returns deny', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const handler = vi.fn(async () => 'deny' as const);
    const pm = new PermissionManager(handler);
    const tool = permTool('rm-rf');

    expect(await pm.checkPermission(tool)).toBe(false);
  });

  it('should mark tool as allowed via allowTool() and check via isAllowed()', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const pm = new PermissionManager();
    expect(pm.isAllowed('myTool')).toBe(false);

    pm.allowTool('myTool', 'session');
    expect(pm.isAllowed('myTool')).toBe(true);
  });

  it('should revoke a tool via revokeTool()', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const pm = new PermissionManager();
    pm.allowTool('myTool', 'session');
    expect(pm.isAllowed('myTool')).toBe(true);

    pm.revokeTool('myTool');
    expect(pm.isAllowed('myTool')).toBe(false);
  });

  it('should clear session-level but keep always-level on clearSession()', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const pm = new PermissionManager();
    pm.allowTool('sessionTool', 'session');
    pm.allowTool('alwaysTool', 'always');

    pm.clearSession();

    expect(pm.isAllowed('sessionTool')).toBe(false);
    expect(pm.isAllowed('alwaysTool')).toBe(true);
  });

  it('should clear everything on clearAll()', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const pm = new PermissionManager();
    pm.allowTool('sessionTool', 'session');
    pm.allowTool('alwaysTool', 'always');

    pm.clearAll();

    expect(pm.isAllowed('sessionTool')).toBe(false);
    expect(pm.isAllowed('alwaysTool')).toBe(false);
  });

  it('should pass (toolName, params) to the handler correctly', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const handler = vi.fn(async () => 'once' as const);
    const pm = new PermissionManager(handler);
    const tool = permTool('file-write');

    await pm.checkPermission(tool, { path: '/etc/passwd', content: 'data' });

    expect(handler).toHaveBeenCalledWith('file-write', { path: '/etc/passwd', content: 'data' });
  });

  it('should skip handler for tools that do not require permission', async () => {
    const { PermissionManager } = await import('@cli-agent/agent');

    const handler = vi.fn(async () => 'deny' as const);
    const pm = new PermissionManager(handler);
    const tool = permTool('safe-read', false);

    expect(await pm.checkPermission(tool)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. SessionManager — Persistence
// ---------------------------------------------------------------------------

describe('SessionManager — Persistence', () => {
  let tempDir: string;
  const tempDirs: string[] = [];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'session-test-'));
    tempDirs.push(tempDir);
  });

  afterAll(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should save a session and report exists() as true', async () => {
    const { SessionManager, MessageManager } = await import('@cli-agent/agent');

    const sm = new SessionManager(tempDir);
    const mm = new MessageManager();
    mm.addSystemMessage('system prompt');
    mm.addUserMessage('hello');

    await sm.save('sess-001', mm);

    expect(await sm.exists('sess-001')).toBe(true);
  });

  it('should load and restore MessageManager state correctly', async () => {
    const { SessionManager, MessageManager } = await import('@cli-agent/agent');

    const sm = new SessionManager(tempDir);

    // Save
    const original = new MessageManager();
    original.addSystemMessage('sys');
    original.addUserMessage('user msg');
    original.addAssistantMessage('assistant reply');
    await sm.save('sess-002', original);

    // Load into a fresh MessageManager
    const restored = new MessageManager();
    const meta = await sm.load('sess-002', restored);

    expect(restored.messageCount).toBe(3);
    const msgs = restored.getMessages();
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('sys');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toBe('user msg');
    expect(msgs[2].role).toBe('assistant');
    expect(msgs[2].content).toBe('assistant reply');

    expect(meta.sessionId).toBe('sess-002');
    expect(meta.createdAt).toBeDefined();
    expect(meta.updatedAt).toBeDefined();
  });

  it('should list all saved sessions with metadata', async () => {
    const { SessionManager, MessageManager } = await import('@cli-agent/agent');

    const sm = new SessionManager(tempDir);

    const mm1 = new MessageManager();
    mm1.addUserMessage('session A');
    await sm.save('sess-a', mm1);

    const mm2 = new MessageManager();
    mm2.addUserMessage('session B');
    await sm.save('sess-b', mm2);

    const sessions = await sm.list();
    expect(sessions).toHaveLength(2);

    const ids = sessions.map(s => s.sessionId);
    expect(ids).toContain('sess-a');
    expect(ids).toContain('sess-b');

    for (const meta of sessions) {
      expect(meta.createdAt).toBeDefined();
      expect(meta.updatedAt).toBeDefined();
    }
  });

  it('should return false for exists() on a non-existent session', async () => {
    const { SessionManager } = await import('@cli-agent/agent');

    const sm = new SessionManager(tempDir);

    expect(await sm.exists('does-not-exist')).toBe(false);
  });

  it('should update updatedAt on re-save while preserving createdAt', async () => {
    const { SessionManager, MessageManager } = await import('@cli-agent/agent');

    const sm = new SessionManager(tempDir);

    const mm = new MessageManager();
    mm.addUserMessage('first save');
    await sm.save('sess-time', mm);

    const loaded1 = new MessageManager();
    const meta1 = await sm.load('sess-time', loaded1);

    // Small delay to ensure timestamps differ
    await new Promise(resolve => setTimeout(resolve, 50));

    mm.addAssistantMessage('second save');
    await sm.save('sess-time', mm);

    const loaded2 = new MessageManager();
    const meta2 = await sm.load('sess-time', loaded2);

    expect(meta2.createdAt).toBe(meta1.createdAt);
    expect(meta2.updatedAt >= meta1.updatedAt).toBe(true);
    expect(loaded2.messageCount).toBe(2);
  });
});
