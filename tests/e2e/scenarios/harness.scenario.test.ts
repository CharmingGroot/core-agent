/**
 * Scenario tests for @core/harness package.
 * Covers DomainManager, InMemoryOperationTracker, createPermissionHandler,
 * HarnessBuilder, and messageToContextMessage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DomainConfig } from '@core/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeDomainConfig(id: string, overrides?: Partial<DomainConfig>): DomainConfig {
  return {
    id,
    name: `Domain ${id}`,
    skills: ['*'],
    rules: [],
    provider: { providerId: 'openai', model: 'gpt-4o-mini', auth: { type: 'api-key', apiKey: 'test' } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. DomainManager — Registration & Validation
// ---------------------------------------------------------------------------
describe('DomainManager — Registration & Validation', () => {
  let DomainManager: Awaited<typeof import('@core/harness')>['DomainManager'];

  beforeEach(async () => {
    const mod = await import('@core/harness');
    DomainManager = mod.DomainManager;
  });

  it('should register a valid domain and retrieve it with getDomain', () => {
    const manager = new DomainManager();
    const config = makeDomainConfig('dev');

    manager.registerDomain(config);

    const retrieved = manager.getDomain('dev');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('dev');
    expect(retrieved!.name).toBe('Domain dev');
  });

  it('should register multiple domains and list them all', () => {
    const manager = new DomainManager();
    manager.registerDomain(makeDomainConfig('a'));
    manager.registerDomain(makeDomainConfig('b'));
    manager.registerDomain(makeDomainConfig('c'));

    const list = manager.listDomains();
    expect(list).toHaveLength(3);

    const ids = list.map((d) => d.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('should return true when removing an existing domain and false for unknown', () => {
    const manager = new DomainManager();
    manager.registerDomain(makeDomainConfig('x'));

    expect(manager.removeDomain('x')).toBe(true);
    expect(manager.getDomain('x')).toBeUndefined();
    expect(manager.removeDomain('nonexistent')).toBe(false);
  });

  it('should return validation error when id is missing', () => {
    const manager = new DomainManager();
    const config = makeDomainConfig('', { id: '' });

    const errors = manager.validateDomain(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('should return validation error when provider is missing', () => {
    const manager = new DomainManager();
    const config = {
      id: 'valid-id',
      name: 'Valid',
      skills: ['*'],
      rules: [],
      provider: undefined as unknown as DomainConfig['provider'],
    } as DomainConfig;

    const errors = manager.validateDomain(config);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('provider'))).toBe(true);
  });

  it('should return empty array for a fully valid config', () => {
    const manager = new DomainManager();
    const config = makeDomainConfig('valid');

    const errors = manager.validateDomain(config);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. InMemoryOperationTracker — Full Lifecycle
// ---------------------------------------------------------------------------
describe('InMemoryOperationTracker — Full Lifecycle', () => {
  let InMemoryOperationTracker: Awaited<typeof import('@core/harness')>['InMemoryOperationTracker'];

  beforeEach(async () => {
    const mod = await import('@core/harness');
    InMemoryOperationTracker = mod.InMemoryOperationTracker;
  });

  it('should create an operation with pending status', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({
      requestId: 'req-1',
      userId: 'user-1',
      domainId: 'dom-1',
      goal: 'test goal',
    });

    expect(opId).toBeDefined();
    expect(typeof opId).toBe('string');

    const state = tracker.get(opId);
    expect(state).toBeDefined();
    expect(state!.status).toBe('pending');
    expect(state!.goal).toBe('test goal');
  });

  it('should transition to running on start()', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });

    tracker.start(opId);

    expect(tracker.get(opId)!.status).toBe('running');
  });

  it('should update progress field via updateProgress()', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });
    tracker.start(opId);

    tracker.updateProgress(opId, { current: 3, total: 10, message: 'Step 3 of 10' });

    const state = tracker.get(opId)!;
    expect(state.progress).toBeDefined();
    expect(state.progress!.current).toBe(3);
    expect(state.progress!.total).toBe(10);
  });

  it('should append task results via addTaskResult()', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });
    tracker.start(opId);

    tracker.addTaskResult(opId, { taskName: 'task-a', success: true, durationMs: 100 });
    tracker.addTaskResult(opId, { taskName: 'task-b', success: false, durationMs: 200, error: 'oops' });

    const state = tracker.get(opId)!;
    expect(state.taskResults).toHaveLength(2);
    expect(state.taskResults[0].taskName).toBe('task-a');
    expect(state.taskResults[1].success).toBe(false);
  });

  it('should transition to completed with completedAt and tokenUsage', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });
    tracker.start(opId);

    tracker.complete(opId, { input: 500, output: 200 });

    const state = tracker.get(opId)!;
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBeDefined();
    expect(state.tokenUsage).toEqual({ input: 500, output: 200 });
  });

  it('should return full state from get()', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'req-9', userId: 'usr-9', domainId: 'dom-9', goal: 'full state' });
    tracker.start(opId);
    tracker.updateProgress(opId, { current: 1, total: 1, message: 'done' });
    tracker.addTaskResult(opId, { taskName: 't', success: true, durationMs: 50 });
    tracker.complete(opId, { input: 10, output: 20 });

    const state = tracker.get(opId)!;
    expect(state.operationId).toBe(opId);
    expect(state.requestId).toBe('req-9');
    expect(state.userId).toBe('usr-9');
    expect(state.domainId).toBe('dom-9');
    expect(state.goal).toBe('full state');
    expect(state.status).toBe('completed');
    expect(state.taskResults).toHaveLength(1);
    expect(state.tokenUsage).toEqual({ input: 10, output: 20 });
  });

  it('should list all operations and listActive returns only running/pending', () => {
    const tracker = new InMemoryOperationTracker();
    const id1 = tracker.create({ requestId: 'r1', userId: 'u', domainId: 'd', goal: 'g1' });
    const id2 = tracker.create({ requestId: 'r2', userId: 'u', domainId: 'd', goal: 'g2' });
    const id3 = tracker.create({ requestId: 'r3', userId: 'u', domainId: 'd', goal: 'g3' });

    tracker.start(id1);
    tracker.complete(id1);
    tracker.start(id2);
    // id3 stays pending

    const all = tracker.list();
    expect(all).toHaveLength(3);

    const active = tracker.listActive();
    expect(active).toHaveLength(2); // id2=running, id3=pending
    const activeIds = active.map((a) => a.operationId);
    expect(activeIds).toContain(id2);
    expect(activeIds).toContain(id3);
    expect(activeIds).not.toContain(id1);
  });

  it('should filter by userId', () => {
    const tracker = new InMemoryOperationTracker();
    tracker.create({ requestId: 'r1', userId: 'alice', domainId: 'd', goal: 'g1' });
    tracker.create({ requestId: 'r2', userId: 'bob', domainId: 'd', goal: 'g2' });
    tracker.create({ requestId: 'r3', userId: 'alice', domainId: 'd', goal: 'g3' });

    const aliceOps = tracker.list({ userId: 'alice' });
    expect(aliceOps).toHaveLength(2);
    expect(aliceOps.every((op) => op.userId === 'alice')).toBe(true);
  });

  it('should filter by status', () => {
    const tracker = new InMemoryOperationTracker();
    const id1 = tracker.create({ requestId: 'r1', userId: 'u', domainId: 'd', goal: 'g1' });
    const id2 = tracker.create({ requestId: 'r2', userId: 'u', domainId: 'd', goal: 'g2' });

    tracker.start(id1);
    tracker.complete(id1);
    // id2 stays pending

    const completed = tracker.list({ status: 'completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0].operationId).toBe(id1);

    const pending = tracker.list({ status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].operationId).toBe(id2);
  });

  it('should set error and status=failed on fail()', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });
    tracker.start(opId);

    tracker.fail(opId, 'something broke');

    const state = tracker.get(opId)!;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('something broke');
    expect(state.completedAt).toBeDefined();
  });

  it('should set status=cancelled on cancel()', () => {
    const tracker = new InMemoryOperationTracker();
    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });
    tracker.start(opId);

    tracker.cancel(opId);

    const state = tracker.get(opId)!;
    expect(state.status).toBe('cancelled');
    expect(state.completedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. OperationTracker — Event Callbacks
// ---------------------------------------------------------------------------
describe('OperationTracker — Event Callbacks', () => {
  let InMemoryOperationTracker: Awaited<typeof import('@core/harness')>['InMemoryOperationTracker'];

  beforeEach(async () => {
    const mod = await import('@core/harness');
    InMemoryOperationTracker = mod.InMemoryOperationTracker;
  });

  it('should fire onStatusChange on create, start, complete, fail, cancel', () => {
    const callback = vi.fn();
    const tracker = new InMemoryOperationTracker({ onStatusChange: callback });

    // create fires with 'pending'
    const id1 = tracker.create({ requestId: 'r1', userId: 'u', domainId: 'd', goal: 'g' });
    expect(callback).toHaveBeenCalledWith(id1, 'pending', expect.objectContaining({ operationId: id1 }));

    // start fires with 'running'
    tracker.start(id1);
    expect(callback).toHaveBeenCalledWith(id1, 'running', expect.objectContaining({ status: 'running' }));

    // complete fires with 'completed'
    tracker.complete(id1);
    expect(callback).toHaveBeenCalledWith(id1, 'completed', expect.objectContaining({ status: 'completed' }));

    // fail fires with 'failed'
    const id2 = tracker.create({ requestId: 'r2', userId: 'u', domainId: 'd', goal: 'g2' });
    tracker.start(id2);
    tracker.fail(id2, 'err');
    expect(callback).toHaveBeenCalledWith(id2, 'failed', expect.objectContaining({ status: 'failed', error: 'err' }));

    // cancel fires with 'cancelled'
    const id3 = tracker.create({ requestId: 'r3', userId: 'u', domainId: 'd', goal: 'g3' });
    tracker.start(id3);
    tracker.cancel(id3);
    expect(callback).toHaveBeenCalledWith(id3, 'cancelled', expect.objectContaining({ status: 'cancelled' }));
  });

  it('should pass (operationId, newStatus, fullState) to the callback', () => {
    const callback = vi.fn();
    const tracker = new InMemoryOperationTracker({ onStatusChange: callback });

    const opId = tracker.create({ requestId: 'r', userId: 'u', domainId: 'd', goal: 'g' });
    tracker.start(opId);

    // Verify the third argument is the full state object
    const lastCall = callback.mock.calls[callback.mock.calls.length - 1];
    expect(lastCall[0]).toBe(opId);
    expect(lastCall[1]).toBe('running');
    const stateArg = lastCall[2];
    expect(stateArg.operationId).toBe(opId);
    expect(stateArg.requestId).toBe('r');
    expect(stateArg.userId).toBe('u');
    expect(stateArg.domainId).toBe('d');
    expect(stateArg.goal).toBe('g');
    expect(stateArg.status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// 4. createPermissionHandler — Composition
// ---------------------------------------------------------------------------
describe('createPermissionHandler — Composition', () => {
  let createPermissionHandler: Awaited<typeof import('@core/harness')>['createPermissionHandler'];
  let OpenPolicy: Awaited<typeof import('@core/types')>['OpenPolicy'];
  let GovernedPolicy: Awaited<typeof import('@core/governance')>['GovernedPolicy'];
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let RuleRegistry: Awaited<typeof import('@core/rule')>['RuleRegistry'];
  let RuleEngine: Awaited<typeof import('@core/rule')>['RuleEngine'];
  let NoDestructiveCommandRule: Awaited<typeof import('@core/rule')>['NoDestructiveCommandRule'];

  beforeEach(async () => {
    const harness = await import('@core/harness');
    const types = await import('@core/types');
    const governance = await import('@core/governance');
    const rule = await import('@core/rule');

    createPermissionHandler = harness.createPermissionHandler;
    OpenPolicy = types.OpenPolicy;
    GovernedPolicy = governance.GovernedPolicy;
    InMemoryGovernanceStore = governance.InMemoryGovernanceStore;
    RuleRegistry = rule.RuleRegistry;
    RuleEngine = rule.RuleEngine;
    NoDestructiveCommandRule = rule.NoDestructiveCommandRule;
  });

  it('should return session for any tool with OpenPolicy', async () => {
    const handler = createPermissionHandler({
      policy: new OpenPolicy(),
      userId: 'user-1',
    });

    const result = await handler('file_read', {});
    expect(result).toBe('session');
  });

  it('should allow file_read and deny unknown_tool with GovernedPolicy', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'developer',
      description: 'Dev role',
      allowedSkills: ['*'],
      allowedTools: ['file_read', 'file_write'],
      policy: {
        approvalRequired: [],
        maxToolCallsPerSession: 100,
        auditLevel: 'basic',
        allowedProviders: ['openai'],
        dataClassification: 'internal',
      },
    });
    await store.createUser({ userId: 'dev-user', roles: ['developer'], domainIds: ['default'] });

    const policy = new GovernedPolicy(store);
    const handler = createPermissionHandler({
      policy,
      userId: 'dev-user',
    });

    const fileReadResult = await handler('file_read', {});
    expect(fileReadResult).toBe('session');

    const unknownResult = await handler('unknown_tool', {});
    expect(unknownResult).toBe('deny');
  });

  it('should deny when RuleEngine blocks rm -rf even if policy allows', async () => {
    const registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule());
    const ruleEngine = new RuleEngine(registry);

    const handler = createPermissionHandler({
      policy: new OpenPolicy(),
      userId: 'user-1',
      ruleEngine,
      sessionId: 'sess-1',
    });

    const result = await handler('bash', { command: 'rm -rf /' });
    expect(result).toBe('deny');
  });

  it('should check rule BEFORE policy (rule blocks, policy.canUseTool never called)', async () => {
    const registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule());
    const ruleEngine = new RuleEngine(registry);

    const canUseToolSpy = vi.fn().mockResolvedValue(true);
    const spyPolicy = {
      canUseTool: canUseToolSpy,
      canUseSkill: vi.fn().mockResolvedValue(true),
      requiresApproval: vi.fn().mockResolvedValue(false),
      requestApproval: vi.fn(),
      recordAction: vi.fn(),
      getAllowedSkills: vi.fn().mockResolvedValue(['*']),
      getAllowedTools: vi.fn().mockResolvedValue(['*']),
      getProfile: vi.fn().mockResolvedValue(null),
    };

    const handler = createPermissionHandler({
      policy: spyPolicy,
      userId: 'user-1',
      ruleEngine,
      sessionId: 'sess-1',
    });

    const result = await handler('bash', { command: 'rm -rf /tmp' });
    expect(result).toBe('deny');
    expect(canUseToolSpy).not.toHaveBeenCalled();
  });

  it('should delegate to interactiveHandler when requiresApproval is true', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'restricted',
      description: 'Restricted role',
      allowedSkills: ['*'],
      allowedTools: ['deploy'],
      policy: {
        approvalRequired: ['deploy'],
        maxToolCallsPerSession: 50,
        auditLevel: 'full',
        allowedProviders: ['openai'],
        dataClassification: 'confidential',
      },
    });
    await store.createUser({ userId: 'restricted-user', roles: ['restricted'], domainIds: ['default'] });

    const policy = new GovernedPolicy(store);
    const interactiveHandler = vi.fn().mockResolvedValue('once' as const);

    const handler = createPermissionHandler({
      policy,
      userId: 'restricted-user',
      interactiveHandler,
    });

    const result = await handler('deploy', {});
    expect(result).toBe('once');
    expect(interactiveHandler).toHaveBeenCalledWith('deploy', {});
  });

  it('should deny when requiresApproval is true but no interactiveHandler', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'restricted',
      description: 'Restricted role',
      allowedSkills: ['*'],
      allowedTools: ['deploy'],
      policy: {
        approvalRequired: ['deploy'],
        maxToolCallsPerSession: 50,
        auditLevel: 'full',
        allowedProviders: ['openai'],
        dataClassification: 'confidential',
      },
    });
    await store.createUser({ userId: 'restricted-user', roles: ['restricted'], domainIds: ['default'] });

    const policy = new GovernedPolicy(store);

    const handler = createPermissionHandler({
      policy,
      userId: 'restricted-user',
      // No interactiveHandler
    });

    const result = await handler('deploy', {});
    expect(result).toBe('deny');
  });
});

// ---------------------------------------------------------------------------
// 5. HarnessBuilder — Fluent API
// ---------------------------------------------------------------------------
describe('HarnessBuilder — Fluent API', () => {
  let HarnessBuilder: Awaited<typeof import('@core/harness')>['HarnessBuilder'];
  let InMemoryOperationTracker: Awaited<typeof import('@core/harness')>['InMemoryOperationTracker'];
  let OpenPolicy: Awaited<typeof import('@core/types')>['OpenPolicy'];

  beforeEach(async () => {
    const harness = await import('@core/harness');
    const types = await import('@core/types');
    HarnessBuilder = harness.HarnessBuilder;
    InMemoryOperationTracker = harness.InMemoryOperationTracker;
    OpenPolicy = types.OpenPolicy;
  });

  it('should build a Harness through fluent chaining', () => {
    const config = makeDomainConfig('prod');
    const built = new HarnessBuilder()
      .withDomain(config)
      .withSkillsDir('/tmp/skills')
      .withRulesDir('/tmp/rules')
      .withPolicy(new OpenPolicy())
      .build();

    expect(built).toBeDefined();
    expect(built).not.toBeNull();
  });

  it('should set default domain correctly', () => {
    const config = makeDomainConfig('primary');
    const built = new HarnessBuilder()
      .withDomain(config)
      .withDefaultDomain('primary')
      .build();

    expect(built).toBeDefined();
  });

  it('should accept an injected operation tracker', () => {
    const tracker = new InMemoryOperationTracker();
    const config = makeDomainConfig('tracked');
    const built = new HarnessBuilder()
      .withDomain(config)
      .withOperationTracker(tracker)
      .build();

    expect(built).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. messageToContextMessage — Conversion
// ---------------------------------------------------------------------------
describe('messageToContextMessage — Conversion', () => {
  let messageToContextMessage: Awaited<typeof import('@core/harness')>['messageToContextMessage'];

  beforeEach(async () => {
    const mod = await import('@core/harness');
    messageToContextMessage = mod.messageToContextMessage;
  });

  it('should convert a user message preserving role and content', () => {
    const msg = { role: 'user' as const, content: 'Hello, world!' };
    const result = messageToContextMessage(msg);

    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello, world!');
  });

  it('should convert an assistant message to role=assistant', () => {
    const msg = { role: 'assistant' as const, content: 'I can help with that.' };
    const result = messageToContextMessage(msg);

    expect(result.role).toBe('assistant');
    expect(result.content).toBe('I can help with that.');
  });

  it('should convert a message with toolResults to role=tool_result', () => {
    const msg = {
      role: 'assistant' as const,
      content: '',
      toolResults: [
        { toolCallId: 'call-1', content: 'result-a' },
        { toolCallId: 'call-2', content: 'result-b' },
      ],
    };
    const result = messageToContextMessage(msg);

    expect(result.role).toBe('tool_result');
    // Content is joined from all tool results
    expect(result.content).toBe('result-a\nresult-b');
    // toolCallId comes from the first tool result
    expect((result as { toolCallId?: string }).toolCallId).toBe('call-1');
  });
});
