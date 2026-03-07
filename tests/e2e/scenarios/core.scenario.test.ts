/**
 * Scenario tests for @cli-agent/core package.
 * Covers Registry, RunContext, EventBus, Config validation, and Error hierarchy.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Registry Lifecycle
// ---------------------------------------------------------------------------
describe('Registry Lifecycle', () => {
  let Registry: Awaited<typeof import('@cli-agent/core')>['Registry'];
  let RegistryError: Awaited<typeof import('@cli-agent/core')>['RegistryError'];

  beforeEach(async () => {
    const core = await import('@cli-agent/core');
    Registry = core.Registry;
    RegistryError = core.RegistryError;
  });

  it('should register multiple items and verify size and getAll', () => {
    const registry = new Registry<string>('test');
    registry.register('a', 'alpha');
    registry.register('b', 'beta');
    registry.register('c', 'charlie');

    expect(registry.size).toBe(3);

    const all = registry.getAll();
    expect(all.size).toBe(3);
    expect(all.get('a')).toBe('alpha');
    expect(all.get('b')).toBe('beta');
    expect(all.get('c')).toBe('charlie');
  });

  it('should throw RegistryError when get() is called with unknown name', () => {
    const registry = new Registry<number>('test');

    expect(() => registry.get('unknown')).toThrow(RegistryError);
    expect(() => registry.get('unknown')).toThrow("'unknown' is not registered");
  });

  it('should return undefined from tryGet() for unknown name without throwing', () => {
    const registry = new Registry<number>('test');

    const result = registry.tryGet('nonexistent');
    expect(result).toBeUndefined();
  });

  it('should return true from unregister for existing item and throw for unknown', () => {
    const registry = new Registry<string>('test');
    registry.register('item', 'value');

    const result = registry.unregister('item');
    expect(result).toBe(true);
    expect(registry.size).toBe(0);

    expect(() => registry.unregister('item')).toThrow(RegistryError);
  });

  it('should empty the registry when clear() is called', () => {
    const registry = new Registry<string>('test');
    registry.register('x', 'xray');
    registry.register('y', 'yankee');
    expect(registry.size).toBe(2);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getAll().size).toBe(0);
  });

  it('should allow re-registration after unregister', () => {
    const registry = new Registry<string>('test');
    registry.register('item', 'original');
    registry.unregister('item');

    registry.register('item', 'replaced');
    expect(registry.get('item')).toBe('replaced');
    expect(registry.size).toBe(1);
  });

  it('should throw RegistryError on duplicate register', () => {
    const registry = new Registry<string>('test');
    registry.register('dup', 'first');

    expect(() => registry.register('dup', 'second')).toThrow(RegistryError);
    expect(() => registry.register('dup', 'second')).toThrow(
      "'dup' is already registered"
    );
  });
});

// ---------------------------------------------------------------------------
// 2. RunContext Lifecycle
// ---------------------------------------------------------------------------
describe('RunContext Lifecycle', () => {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let RunContext: Awaited<typeof import('@cli-agent/core')>['RunContext'];

  const validAgentConfig = {
    provider: {
      providerId: 'test-provider',
      model: 'test-model',
      auth: { type: 'no-auth' as const },
    },
    workingDirectory: '/tmp/test',
  };

  beforeEach(async () => {
    const core = await import('@cli-agent/core');
    RunContext = core.RunContext;
  });

  it('should be created with config and have runId, workingDirectory, createdAt', () => {
    const ctx = new RunContext(validAgentConfig as never);

    expect(ctx.runId).toMatch(UUID_REGEX);
    expect(ctx.workingDirectory).toBe('/tmp/test');
    expect(ctx.createdAt).toBeInstanceOf(Date);
    expect(ctx.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should round-trip setMetadata/getMetadata with various JsonValue types', () => {
    const ctx = new RunContext(validAgentConfig as never);

    ctx.setMetadata('str', 'hello');
    ctx.setMetadata('num', 42);
    ctx.setMetadata('bool', true);
    ctx.setMetadata('nil', null);
    ctx.setMetadata('arr', [1, 'two', false]);
    ctx.setMetadata('nested', { a: { b: [1, 2] }, c: 'deep' });

    expect(ctx.getMetadata('str')).toBe('hello');
    expect(ctx.getMetadata('num')).toBe(42);
    expect(ctx.getMetadata('bool')).toBe(true);
    expect(ctx.getMetadata('nil')).toBeNull();
    expect(ctx.getMetadata('arr')).toEqual([1, 'two', false]);
    expect(ctx.getMetadata('nested')).toEqual({ a: { b: [1, 2] }, c: 'deep' });
  });

  it('should return readonly map from getAllMetadata', () => {
    const ctx = new RunContext(validAgentConfig as never);
    ctx.setMetadata('key', 'value');

    const all = ctx.getAllMetadata();
    expect(all).toBeInstanceOf(Map);
    expect(all.get('key')).toBe('value');
    expect(all.size).toBe(1);
  });

  it('should set isAborted=true and signal.aborted=true after abort()', () => {
    const ctx = new RunContext(validAgentConfig as never);

    expect(ctx.isAborted).toBe(false);
    expect(ctx.signal.aborted).toBe(false);

    ctx.abort();

    expect(ctx.isAborted).toBe(true);
    expect(ctx.signal.aborted).toBe(true);
  });

  it('should propagate abort reason to signal.reason', () => {
    const ctx = new RunContext(validAgentConfig as never);
    const reason = 'user cancelled';

    ctx.abort(reason);

    expect(ctx.isAborted).toBe(true);
    expect(ctx.signal.reason).toBe(reason);
  });

  it('should still allow metadata operations after abort', () => {
    const ctx = new RunContext(validAgentConfig as never);
    ctx.abort();

    // RunContext does not prevent metadata writes after abort
    ctx.setMetadata('afterAbort', 'still works');
    expect(ctx.getMetadata('afterAbort')).toBe('still works');
  });
});

// ---------------------------------------------------------------------------
// 3. EventBus Pub/Sub
// ---------------------------------------------------------------------------
describe('EventBus Pub/Sub', () => {
  let EventBus: Awaited<typeof import('@cli-agent/core')>['EventBus'];

  beforeEach(async () => {
    const core = await import('@cli-agent/core');
    EventBus = core.EventBus;
  });

  it('should deliver emitted events to on() listeners with correct payload', () => {
    const bus = new EventBus();
    const received: unknown[] = [];

    bus.on('agent:start', (payload) => {
      received.push(payload);
    });

    bus.emit('agent:start', { runId: 'run-1' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ runId: 'run-1' });
  });

  it('should fire once() listener only once even with multiple emits', () => {
    const bus = new EventBus();
    let callCount = 0;

    bus.once('agent:start', () => {
      callCount++;
    });

    bus.emit('agent:start', { runId: 'r1' });
    bus.emit('agent:start', { runId: 'r2' });
    bus.emit('agent:start', { runId: 'r3' });

    expect(callCount).toBe(1);
  });

  it('should return a working unsubscribe function from on()', () => {
    const bus = new EventBus();
    let callCount = 0;

    const unsub = bus.on('agent:start', () => {
      callCount++;
    });

    bus.emit('agent:start', { runId: 'r1' });
    expect(callCount).toBe(1);

    unsub();

    bus.emit('agent:start', { runId: 'r2' });
    expect(callCount).toBe(1);
  });

  it('should fire all multiple listeners on the same event', () => {
    const bus = new EventBus();
    const results: string[] = [];

    bus.on('agent:start', () => results.push('listener-a'));
    bus.on('agent:start', () => results.push('listener-b'));
    bus.on('agent:start', () => results.push('listener-c'));

    bus.emit('agent:start', { runId: 'r1' });

    expect(results).toEqual(['listener-a', 'listener-b', 'listener-c']);
  });

  it('should remove only the specified event listeners with removeAllListeners(event)', () => {
    const bus = new EventBus();
    let startCount = 0;
    let endCount = 0;

    bus.on('agent:start', () => { startCount++; });
    bus.on('agent:end', () => { endCount++; });

    bus.removeAllListeners('agent:start');

    bus.emit('agent:start', { runId: 'r1' });
    bus.emit('agent:end', { runId: 'r1', reason: 'done' });

    expect(startCount).toBe(0);
    expect(endCount).toBe(1);
  });

  it('should remove all listeners when removeAllListeners() is called with no args', () => {
    const bus = new EventBus();
    let startCount = 0;
    let endCount = 0;

    bus.on('agent:start', () => { startCount++; });
    bus.on('agent:end', () => { endCount++; });

    bus.removeAllListeners();

    bus.emit('agent:start', { runId: 'r1' });
    bus.emit('agent:end', { runId: 'r1', reason: 'done' });

    expect(startCount).toBe(0);
    expect(endCount).toBe(0);
  });

  it('should report accurate listenerCount after add and remove', () => {
    const bus = new EventBus();

    expect(bus.listenerCount('agent:start')).toBe(0);

    const unsub1 = bus.on('agent:start', () => {});
    const unsub2 = bus.on('agent:start', () => {});
    bus.on('agent:start', () => {});

    expect(bus.listenerCount('agent:start')).toBe(3);

    unsub1();
    expect(bus.listenerCount('agent:start')).toBe(2);

    unsub2();
    expect(bus.listenerCount('agent:start')).toBe(1);
  });

  it('should not leak events between different event names', () => {
    const bus = new EventBus();
    const startPayloads: unknown[] = [];
    const endPayloads: unknown[] = [];

    bus.on('agent:start', (p) => startPayloads.push(p));
    bus.on('agent:end', (p) => endPayloads.push(p));

    bus.emit('agent:start', { runId: 'r1' });

    expect(startPayloads).toHaveLength(1);
    expect(endPayloads).toHaveLength(0);

    bus.emit('agent:end', { runId: 'r2', reason: 'finished' });

    expect(startPayloads).toHaveLength(1);
    expect(endPayloads).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Config Validation (Zod schemas)
// ---------------------------------------------------------------------------
describe('Config Validation', () => {
  let parseAgentConfig: Awaited<typeof import('@cli-agent/core')>['parseAgentConfig'];
  let apiKeyAuth: Awaited<typeof import('@cli-agent/core')>['apiKeyAuth'];
  let noAuth: Awaited<typeof import('@cli-agent/core')>['noAuth'];
  let providerConfigSchema: Awaited<typeof import('@cli-agent/core')>['providerConfigSchema'];
  let ConfigError: Awaited<typeof import('@cli-agent/core')>['ConfigError'];

  beforeEach(async () => {
    const core = await import('@cli-agent/core');
    parseAgentConfig = core.parseAgentConfig;
    apiKeyAuth = core.apiKeyAuth;
    noAuth = core.noAuth;
    providerConfigSchema = core.providerConfigSchema;
    ConfigError = core.ConfigError;
  });

  it('should succeed with valid agent config', () => {
    const raw = {
      provider: {
        providerId: 'openai',
        model: 'gpt-4',
        auth: { type: 'api-key', apiKey: 'sk-test123' },
      },
      workingDirectory: '/tmp/work',
    };

    const config = parseAgentConfig(raw);
    expect(config.provider.providerId).toBe('openai');
    expect(config.provider.model).toBe('gpt-4');
    expect(config.workingDirectory).toBe('/tmp/work');
    expect(config.maxIterations).toBe(50); // default
    expect(config.provider.maxTokens).toBe(4096); // default
    expect(config.provider.temperature).toBe(0.7); // default
  });

  it('should throw ConfigError when required fields are missing', () => {
    const invalidRaw = {
      provider: {
        // missing providerId and model
        auth: { type: 'no-auth' },
      },
    };

    expect(() => parseAgentConfig(invalidRaw)).toThrow(ConfigError);
  });

  it('should create correct api-key auth object with apiKeyAuth()', () => {
    const auth = apiKeyAuth('my-secret-key');

    expect(auth).toEqual({
      type: 'api-key',
      apiKey: 'my-secret-key',
    });
  });

  it('should create correct no-auth object with noAuth()', () => {
    const auth = noAuth();

    expect(auth).toEqual({ type: 'no-auth' });
  });

  it('should validate provider config with providerConfigSchema', () => {
    const validProvider = {
      providerId: 'anthropic',
      model: 'claude-3',
      auth: { type: 'no-auth' },
    };

    const result = providerConfigSchema.safeParse(validProvider);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.providerId).toBe('anthropic');
      expect(result.data.model).toBe('claude-3');
      expect(result.data.maxTokens).toBe(4096);
      expect(result.data.temperature).toBe(0.7);
    }

    const invalidProvider = {
      providerId: '',
      model: '',
      auth: { type: 'no-auth' },
    };

    const failResult = providerConfigSchema.safeParse(invalidProvider);
    expect(failResult.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Error Hierarchy
// ---------------------------------------------------------------------------
describe('Error Hierarchy', () => {
  let errors: {
    AgentError: Awaited<typeof import('@cli-agent/core')>['AgentError'];
    RegistryError: Awaited<typeof import('@cli-agent/core')>['RegistryError'];
    ConfigError: Awaited<typeof import('@cli-agent/core')>['ConfigError'];
    ProviderError: Awaited<typeof import('@cli-agent/core')>['ProviderError'];
    ToolExecutionError: Awaited<typeof import('@cli-agent/core')>['ToolExecutionError'];
    SandboxError: Awaited<typeof import('@cli-agent/core')>['SandboxError'];
    PermissionDeniedError: Awaited<typeof import('@cli-agent/core')>['PermissionDeniedError'];
    AbortError: Awaited<typeof import('@cli-agent/core')>['AbortError'];
  };

  beforeEach(async () => {
    const core = await import('@cli-agent/core');
    errors = {
      AgentError: core.AgentError,
      RegistryError: core.RegistryError,
      ConfigError: core.ConfigError,
      ProviderError: core.ProviderError,
      ToolExecutionError: core.ToolExecutionError,
      SandboxError: core.SandboxError,
      PermissionDeniedError: core.PermissionDeniedError,
      AbortError: core.AbortError,
    };
  });

  it('should have all errors extend AgentError', () => {
    const { AgentError } = errors;

    const instances = [
      new errors.RegistryError('reg err'),
      new errors.ConfigError('cfg err'),
      new errors.ProviderError('prov err'),
      new errors.ToolExecutionError('myTool', 'tool err'),
      new errors.SandboxError('sandbox err'),
      new errors.PermissionDeniedError('forbiddenTool'),
      new errors.AbortError('aborted'),
    ];

    for (const instance of instances) {
      expect(instance).toBeInstanceOf(AgentError);
      expect(instance).toBeInstanceOf(Error);
    }
  });

  it('should preserve error messages', () => {
    expect(new errors.RegistryError('reg message').message).toBe('reg message');
    expect(new errors.ConfigError('cfg message').message).toBe('cfg message');
    expect(new errors.ProviderError('prov message').message).toBe('prov message');
    expect(new errors.ToolExecutionError('t', 'tool message').message).toBe('tool message');
    expect(new errors.SandboxError('sandbox message').message).toBe('sandbox message');
    expect(new errors.PermissionDeniedError('myTool').message).toBe(
      'Permission denied for tool: myTool'
    );
    expect(new errors.AbortError('abort message').message).toBe('abort message');
    expect(new errors.AbortError().message).toBe('Operation aborted');
  });

  it('should have error names matching class names', () => {
    expect(new errors.AgentError('x', 'X').name).toBe('AgentError');
    expect(new errors.RegistryError('x').name).toBe('RegistryError');
    expect(new errors.ConfigError('x').name).toBe('ConfigError');
    expect(new errors.ProviderError('x').name).toBe('ProviderError');
    expect(new errors.ToolExecutionError('t', 'x').name).toBe('ToolExecutionError');
    expect(new errors.SandboxError('x').name).toBe('SandboxError');
    expect(new errors.PermissionDeniedError('t').name).toBe('PermissionDeniedError');
    expect(new errors.AbortError().name).toBe('AbortError');
  });
});
