/**
 * @core/rule — Detailed scenario tests for RuleRegistry, RuleEngine, and built-in rules.
 *
 * All imports use dynamic `await import(...)` to match the project convention.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  RuleContext,
  IRule,
  IPolicyProvider,
  ApprovalResult,
} from '@core/types';

import type {
  RuleRegistry as RuleRegistryType,
  RuleEngine as RuleEngineType,
  NoDestructiveCommandRule as NoDestructiveCommandRuleType,
  PiiRedactRule as PiiRedactRuleType,
  MaxToolCallsRule as MaxToolCallsRuleType,
  RateLimiterRule as RateLimiterRuleType,
  DomainScopeRule as DomainScopeRuleType,
  ReflectAfterEditRule as ReflectAfterEditRuleType,
  RequireApprovalRule as RequireApprovalRuleType,
  SessionIsolationRule as SessionIsolationRuleType,
  AuditLogRule as AuditLogRuleType,
  GovernedRulesOptions,
} from '@core/rule';

/* ------------------------------------------------------------------ */
/*  Helper                                                            */
/* ------------------------------------------------------------------ */

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    agentId: 'agent-1',
    skillName: 'default',
    toolName: 'shell_exec',
    toolParams: {},
    userId: 'user-1',
    metadata: {},
    ...overrides,
  };
}

function makeMockPolicy(overrides: Partial<IPolicyProvider> = {}): IPolicyProvider {
  return {
    canUseSkill: vi.fn().mockResolvedValue(true),
    canUseTool: vi.fn().mockResolvedValue(true),
    requiresApproval: vi.fn().mockResolvedValue(false),
    requestApproval: vi.fn().mockResolvedValue({
      status: 'approved',
      timestamp: new Date(),
    } satisfies ApprovalResult),
    recordAction: vi.fn().mockResolvedValue(undefined),
    getAllowedSkills: vi.fn().mockResolvedValue([]),
    getAllowedTools: vi.fn().mockResolvedValue([]),
    getProfile: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  1. Rule Registry Management                                       */
/* ------------------------------------------------------------------ */

describe('Scenario 1: Rule Registry Management', () => {
  let RuleRegistry: typeof RuleRegistryType;
  let NoDestructiveCommandRule: typeof NoDestructiveCommandRuleType;
  let PiiRedactRule: typeof PiiRedactRuleType;
  let MaxToolCallsRule: typeof MaxToolCallsRuleType;
  let ReflectAfterEditRule: typeof ReflectAfterEditRuleType;

  beforeEach(async () => {
    const ruleMod = await import('@core/rule');
    RuleRegistry = ruleMod.RuleRegistry;
    NoDestructiveCommandRule = ruleMod.NoDestructiveCommandRule;
    PiiRedactRule = ruleMod.PiiRedactRule;
    MaxToolCallsRule = ruleMod.MaxToolCallsRule;
    ReflectAfterEditRule = ruleMod.ReflectAfterEditRule;
  });

  it('register multiple rules, getAll returns all', () => {
    const registry = new RuleRegistry();
    const r1 = new NoDestructiveCommandRule();
    const r2 = new PiiRedactRule();
    const r3 = new MaxToolCallsRule(5);

    registry.register(r1);
    registry.register(r2);
    registry.register(r3);

    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((r: IRule) => r.name)).toEqual(
      expect.arrayContaining([r1.name, r2.name, r3.name]),
    );
  });

  it('getByPhase("pre") returns only pre-phase rules', () => {
    const registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule());
    registry.register(new MaxToolCallsRule(10));
    registry.register(new PiiRedactRule()); // post

    const preRules = registry.getByPhase('pre');
    expect(preRules.length).toBeGreaterThanOrEqual(2);
    for (const rule of preRules) {
      expect(rule.phase).toBe('pre');
    }
  });

  it('getByPhase("post") returns only post-phase rules', () => {
    const registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule()); // pre
    registry.register(new PiiRedactRule());
    registry.register(new ReflectAfterEditRule());

    const postRules = registry.getByPhase('post');
    expect(postRules.length).toBeGreaterThanOrEqual(2);
    for (const rule of postRules) {
      expect(rule.phase).toBe('post');
    }
  });

  it('duplicate name registration throws', () => {
    const registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule());

    expect(() => registry.register(new NoDestructiveCommandRule())).toThrow(
      /already registered/,
    );
  });

  it('unregister works, has() returns false after', () => {
    const registry = new RuleRegistry();
    const rule = new NoDestructiveCommandRule();
    registry.register(rule);

    expect(registry.has(rule.name)).toBe(true);
    const removed = registry.unregister(rule.name);
    expect(removed).toBe(true);
    expect(registry.has(rule.name)).toBe(false);
    expect(registry.get(rule.name)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  2. NoDestructiveCommandRule — Comprehensive Patterns              */
/* ------------------------------------------------------------------ */

describe('Scenario 2: NoDestructiveCommandRule — Comprehensive Patterns', () => {
  let rule: InstanceType<typeof NoDestructiveCommandRuleType>;

  beforeEach(async () => {
    const { NoDestructiveCommandRule } = await import('@core/rule');
    rule = new NoDestructiveCommandRule();
  });

  const BLOCKED_COMMANDS = [
    'rm -rf /',
    'rm -rf /home',
    'DROP TABLE users',
    'TRUNCATE TABLE logs',
    'mkfs.ext4 /dev/sda',
    'dd if=/dev/zero of=/dev/sda',
    'chmod -R 777 /etc/passwd',
    'git push --force origin main',
  ];

  for (const cmd of BLOCKED_COMMANDS) {
    it(`blocks: "${cmd}"`, async () => {
      const ctx = makeContext({ toolParams: { command: cmd } });
      const result = await rule.evaluate(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });
  }

  const ALLOWED_COMMANDS = [
    'ls -la',
    'rm file.txt',
    'SELECT * FROM users',
    'git push origin main',
    'chmod 644 file.txt',
  ];

  for (const cmd of ALLOWED_COMMANDS) {
    it(`allows: "${cmd}"`, async () => {
      const ctx = makeContext({ toolParams: { command: cmd } });
      const result = await rule.evaluate(ctx);
      expect(result.allowed).toBe(true);
    });
  }

  it('non-shell tools pass through (no command/input param)', async () => {
    const ctx = makeContext({
      toolName: 'file_read',
      toolParams: { path: '/etc/passwd' },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  3. PiiRedactRule — Redaction Patterns                             */
/* ------------------------------------------------------------------ */

describe('Scenario 3: PiiRedactRule — Redaction Patterns', () => {
  let rule: InstanceType<typeof PiiRedactRuleType>;

  beforeEach(async () => {
    const { PiiRedactRule } = await import('@core/rule');
    rule = new PiiRedactRule();
  });

  it('redacts email address', async () => {
    const ctx = makeContext({
      toolResult: { success: true, output: 'contact: user@example.com', durationMs: 10 },
    });
    const result = await rule.evaluate(ctx);
    expect(result.filteredOutput).toBeDefined();
    expect(result.filteredOutput).not.toContain('user@example.com');
    expect(result.filteredOutput).toContain('[REDACTED]');
  });

  it('redacts phone number: 010-1234-5678', async () => {
    const ctx = makeContext({
      toolResult: { success: true, output: 'call 010-1234-5678', durationMs: 10 },
    });
    const result = await rule.evaluate(ctx);
    expect(result.filteredOutput).toBeDefined();
    expect(result.filteredOutput).not.toContain('010-1234-5678');
    expect(result.filteredOutput).toContain('[REDACTED]');
  });

  it('redacts phone number: +82-10-1234-5678', async () => {
    const ctx = makeContext({
      toolResult: { success: true, output: 'phone: +82-10-1234-5678', durationMs: 10 },
    });
    const result = await rule.evaluate(ctx);
    expect(result.filteredOutput).toBeDefined();
    expect(result.filteredOutput).not.toContain('+82-10-1234-5678');
  });

  it('redacts SSN: 123-45-6789', async () => {
    const ctx = makeContext({
      toolResult: { success: true, output: 'SSN is 123-45-6789', durationMs: 10 },
    });
    const result = await rule.evaluate(ctx);
    expect(result.filteredOutput).toBeDefined();
    expect(result.filteredOutput).not.toContain('123-45-6789');
    expect(result.filteredOutput).toContain('[REDACTED]');
  });

  it('redacts multiple PII in one output', async () => {
    const ctx = makeContext({
      toolResult: {
        success: true,
        output: 'Email: a@b.com, Phone: 010-1111-2222, SSN: 111-22-3333',
        durationMs: 10,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result.filteredOutput).toBeDefined();
    expect(result.filteredOutput).not.toContain('a@b.com');
    expect(result.filteredOutput).not.toContain('010-1111-2222');
    expect(result.filteredOutput).not.toContain('111-22-3333');
  });

  it('no PII → allowed: true, no filteredOutput', async () => {
    const ctx = makeContext({
      toolResult: { success: true, output: 'hello world', durationMs: 10 },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
    expect(result.filteredOutput).toBeUndefined();
  });

  it('empty output → allowed: true', async () => {
    const ctx = makeContext({
      toolResult: { success: true, output: '', durationMs: 10 },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  4. MaxToolCallsRule — Counter                                     */
/* ------------------------------------------------------------------ */

describe('Scenario 4: MaxToolCallsRule — Counter', () => {
  let rule: InstanceType<typeof MaxToolCallsRuleType>;

  beforeEach(async () => {
    const { MaxToolCallsRule } = await import('@core/rule');
    rule = new MaxToolCallsRule(3);
  });

  it('first 3 calls are allowed', async () => {
    const ctx = makeContext();
    for (let i = 0; i < 3; i++) {
      const result = await rule.evaluate(ctx);
      expect(result.allowed).toBe(true);
    }
  });

  it('4th call is blocked with reason', async () => {
    const ctx = makeContext();
    for (let i = 0; i < 3; i++) {
      await rule.evaluate(ctx);
    }
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/exceeded/i);
  });

  it('resetCount() allows calls again', async () => {
    const ctx = makeContext();
    for (let i = 0; i < 4; i++) {
      await rule.evaluate(ctx);
    }
    rule.resetCount();
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });

  it('different tools all count toward same limit', async () => {
    const tools = ['file_read', 'file_write', 'shell_exec', 'search'];
    for (let i = 0; i < 3; i++) {
      const result = await rule.evaluate(makeContext({ toolName: tools[i] }));
      expect(result.allowed).toBe(true);
    }
    const result = await rule.evaluate(makeContext({ toolName: tools[3] }));
    expect(result.allowed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  5. RateLimiterRule — Per-User Window                              */
/* ------------------------------------------------------------------ */

describe('Scenario 5: RateLimiterRule — Per-User Window', () => {
  let rule: InstanceType<typeof RateLimiterRuleType>;

  beforeEach(async () => {
    const { RateLimiterRule } = await import('@core/rule');
    // max 2 calls, default window (60s)
    rule = new RateLimiterRule(2);
  });

  it('first 2 calls for user-1 are allowed', async () => {
    const ctx = makeContext({ userId: 'user-1' });
    expect((await rule.evaluate(ctx)).allowed).toBe(true);
    expect((await rule.evaluate(ctx)).allowed).toBe(true);
  });

  it('3rd call for user-1 is blocked', async () => {
    const ctx = makeContext({ userId: 'user-1' });
    await rule.evaluate(ctx);
    await rule.evaluate(ctx);
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/rate limit/i);
  });

  it('user-2 still has their own limit (allowed)', async () => {
    const ctx1 = makeContext({ userId: 'user-1' });
    await rule.evaluate(ctx1);
    await rule.evaluate(ctx1);
    await rule.evaluate(ctx1); // user-1 blocked

    const ctx2 = makeContext({ userId: 'user-2' });
    const result = await rule.evaluate(ctx2);
    expect(result.allowed).toBe(true);
  });

  it('resetAll() clears all counters', async () => {
    const ctx = makeContext({ userId: 'user-1' });
    await rule.evaluate(ctx);
    await rule.evaluate(ctx);
    await rule.evaluate(ctx); // blocked

    rule.resetAll();

    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  6. DomainScopeRule — Tool Isolation                               */
/* ------------------------------------------------------------------ */

describe('Scenario 6: DomainScopeRule — Tool Isolation', () => {
  let rule: InstanceType<typeof DomainScopeRuleType>;

  beforeEach(async () => {
    const { DomainScopeRule } = await import('@core/rule');
    const domainToolMap = new Map<string, string[]>([
      ['domain-A', ['file_read', 'file_write']],
      ['domain-B', ['shell_exec']],
    ]);
    rule = new DomainScopeRule(domainToolMap);
  });

  it('domain-A + file_read → allowed', async () => {
    const ctx = makeContext({ domainId: 'domain-A', toolName: 'file_read' });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });

  it('domain-A + shell_exec → blocked', async () => {
    const ctx = makeContext({ domainId: 'domain-A', toolName: 'shell_exec' });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not allowed in domain/i);
  });

  it('domain-B + shell_exec → allowed', async () => {
    const ctx = makeContext({ domainId: 'domain-B', toolName: 'shell_exec' });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });

  it('unknown domain (not in map) → allowed (no restriction)', async () => {
    const ctx = makeContext({ domainId: 'domain-C', toolName: 'shell_exec' });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Multi-Rule Engine Pipeline                                     */
/* ------------------------------------------------------------------ */

describe('Scenario 7: Multi-Rule Engine Pipeline', () => {
  let registry: InstanceType<typeof RuleRegistryType>;
  let engine: InstanceType<typeof RuleEngineType>;

  beforeEach(async () => {
    const {
      RuleRegistry,
      RuleEngine,
      NoDestructiveCommandRule,
      MaxToolCallsRule,
      PiiRedactRule,
      ReflectAfterEditRule,
    } = await import('@core/rule');

    registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule());
    registry.register(new MaxToolCallsRule(5));
    registry.register(new PiiRedactRule());
    registry.register(new ReflectAfterEditRule());

    engine = new RuleEngine(registry);
  });

  it('safe command → evaluatePre allowed', async () => {
    const ctx = makeContext({ toolParams: { command: 'ls -la' } });
    const preResult = await engine.evaluatePre(ctx);
    expect(preResult.allowed).toBe(true);
  });

  it('safe command → evaluatePost passes through (no filteredOutput)', async () => {
    const ctx = makeContext({
      toolParams: { command: 'ls -la' },
      toolResult: { success: true, output: 'file1.txt\nfile2.txt', durationMs: 5 },
    });
    const postResult = await engine.evaluatePost(ctx);
    expect(postResult.filteredOutput).toBeUndefined();
  });

  it('dangerous command → evaluatePre blocks', async () => {
    const ctx = makeContext({ toolParams: { command: 'rm -rf /' } });
    const preResult = await engine.evaluatePre(ctx);
    expect(preResult.allowed).toBe(false);
    expect(preResult.reason).toBeDefined();
  });

  it('output with PII → evaluatePost returns filteredOutput', async () => {
    const ctx = makeContext({
      toolResult: {
        success: true,
        output: 'User email: admin@corp.io',
        durationMs: 10,
      },
    });
    const postResult = await engine.evaluatePost(ctx);
    expect(postResult.filteredOutput).toBeDefined();
    expect(postResult.filteredOutput).not.toContain('admin@corp.io');
    expect(postResult.filteredOutput).toContain('[REDACTED]');
  });

  it('after file_write → evaluatePost has ReflectAfterEditRule warning', async () => {
    const ctx = makeContext({
      toolName: 'file_write',
      toolResult: { success: true, output: 'written OK', durationMs: 3 },
    });
    const postResult = await engine.evaluatePost(ctx);
    const reflectResult = postResult.results.find(
      (r) => r.reason !== undefined && /reflect/i.test(r.reason),
    );
    expect(reflectResult).toBeDefined();
    expect(reflectResult!.allowed).toBe(true);
    expect(reflectResult!.reason).toMatch(/reflection recommended/i);
  });
});

/* ------------------------------------------------------------------ */
/*  8. createGovernedRules Factory                                    */
/* ------------------------------------------------------------------ */

describe('Scenario 8: createGovernedRules Factory', () => {
  it('creates the correct set of governed rules with mock policy', async () => {
    const { createGovernedRules } = await import('@core/rule');

    const policy = makeMockPolicy();
    const options: GovernedRulesOptions = {
      approvalTools: ['shell_exec'],
      rateLimit: 50,
      rateLimitWindowMs: 30_000,
      domainToolMap: new Map([['ops', ['shell_exec', 'file_read']]]),
      allowedSessions: new Set(['sess-1']),
    };

    const rules = createGovernedRules(policy, options);

    // createGovernedRules returns 5 rules
    expect(rules).toHaveLength(5);

    const names = rules.map((r: IRule) => r.name);
    expect(names).toContain('require-approval');
    expect(names).toContain('rate-limiter');
    expect(names).toContain('domain-scope');
    expect(names).toContain('reflect-after-edit');
    expect(names).toContain('session-isolation');
  });

  it('each rule has correct phase assignment', async () => {
    const { createGovernedRules } = await import('@core/rule');

    const policy = makeMockPolicy();
    const rules = createGovernedRules(policy);

    const preRules = rules.filter((r: IRule) => r.phase === 'pre');
    const postRules = rules.filter((r: IRule) => r.phase === 'post');

    // require-approval, rate-limiter, domain-scope, session-isolation → pre
    expect(preRules).toHaveLength(4);
    // reflect-after-edit → post
    expect(postRules).toHaveLength(1);
    expect(postRules[0].name).toBe('reflect-after-edit');
  });
});
