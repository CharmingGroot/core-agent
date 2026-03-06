import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RequireApprovalRule,
  RateLimiterRule,
  DomainScopeRule,
  ReflectAfterEditRule,
  SessionIsolationRule,
  createGovernedRules,
} from '../src/governed-rules.js';
import type { RuleContext, IPolicyProvider } from '@core/types';

function createContext(overrides?: Partial<RuleContext>): RuleContext {
  return {
    agentId: 'agent-1',
    skillName: 'test-skill',
    toolName: 'file_read',
    toolParams: {},
    userId: 'user-1',
    metadata: {},
    ...overrides,
  };
}

function createMockPolicyProvider(
  overrides?: Partial<Record<keyof IPolicyProvider, unknown>>,
): IPolicyProvider {
  return {
    canUseSkill: vi.fn().mockResolvedValue(true),
    canUseTool: vi.fn().mockResolvedValue(true),
    requiresApproval: vi.fn().mockResolvedValue(false),
    requestApproval: vi.fn().mockResolvedValue({
      status: 'approved' as const,
      timestamp: new Date(),
    }),
    recordAction: vi.fn().mockResolvedValue(undefined),
    getAllowedSkills: vi.fn().mockResolvedValue([]),
    getAllowedTools: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RequireApprovalRule
// ---------------------------------------------------------------------------
describe('RequireApprovalRule', () => {
  it('should block file_write when approval denied', async () => {
    const provider = createMockPolicyProvider({
      requiresApproval: vi.fn().mockResolvedValue(true),
      requestApproval: vi.fn().mockResolvedValue({
        status: 'denied' as const,
        reason: 'Not authorized',
        timestamp: new Date(),
      }),
    });
    const rule = new RequireApprovalRule(provider);
    const ctx = createContext({ toolName: 'file_write' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Approval denied');
    expect(result.reason).toContain('file_write');
  });

  it('should allow file_write when approval granted', async () => {
    const provider = createMockPolicyProvider({
      requiresApproval: vi.fn().mockResolvedValue(true),
      requestApproval: vi.fn().mockResolvedValue({
        status: 'approved' as const,
        timestamp: new Date(),
      }),
    });
    const rule = new RequireApprovalRule(provider);
    const ctx = createContext({ toolName: 'file_write' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
  });

  it('should allow file_read (not in approval list)', async () => {
    const provider = createMockPolicyProvider({
      requiresApproval: vi.fn().mockResolvedValue(true),
    });
    const rule = new RequireApprovalRule(provider);
    const ctx = createContext({ toolName: 'file_read' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
    expect(provider.requiresApproval).not.toHaveBeenCalled();
  });

  it('should use custom approval tools list', async () => {
    const provider = createMockPolicyProvider({
      requiresApproval: vi.fn().mockResolvedValue(true),
      requestApproval: vi.fn().mockResolvedValue({
        status: 'denied' as const,
        reason: 'Nope',
        timestamp: new Date(),
      }),
    });
    const rule = new RequireApprovalRule(provider, ['deploy', 'db_migrate']);
    const ctx = createContext({ toolName: 'deploy' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('deploy');
  });
});

// ---------------------------------------------------------------------------
// RateLimiterRule
// ---------------------------------------------------------------------------
describe('RateLimiterRule', () => {
  it('should allow calls within limit', async () => {
    const rule = new RateLimiterRule(3);
    const ctx = createContext();

    const r1 = await rule.evaluate(ctx);
    const r2 = await rule.evaluate(ctx);
    const r3 = await rule.evaluate(ctx);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('should block calls exceeding limit', async () => {
    const rule = new RateLimiterRule(2);
    const ctx = createContext();

    await rule.evaluate(ctx); // 1
    await rule.evaluate(ctx); // 2
    const r3 = await rule.evaluate(ctx); // 3 -> blocked

    expect(r3.allowed).toBe(false);
    expect(r3.reason).toContain('Rate limit exceeded');
    expect(r3.reason).toContain('3/2');
  });

  it('should reset after time window expires', async () => {
    const rule = new RateLimiterRule(1, 100);
    const ctx = createContext();

    await rule.evaluate(ctx); // 1 -> allowed
    const blocked = await rule.evaluate(ctx); // 2 -> blocked
    expect(blocked.allowed).toBe(false);

    // Simulate window expiry by waiting
    await new Promise((resolve) => setTimeout(resolve, 150));

    const afterWindow = await rule.evaluate(ctx); // new window -> allowed
    expect(afterWindow.allowed).toBe(true);
  });

  it('should track limits per user separately', async () => {
    const rule = new RateLimiterRule(1);
    const ctx1 = createContext({ userId: 'alice' });
    const ctx2 = createContext({ userId: 'bob' });

    const r1 = await rule.evaluate(ctx1); // alice: 1 -> allowed
    const r2 = await rule.evaluate(ctx2); // bob: 1 -> allowed

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);

    const r3 = await rule.evaluate(ctx1); // alice: 2 -> blocked
    expect(r3.allowed).toBe(false);

    const r4 = await rule.evaluate(ctx2); // bob: 2 -> blocked
    expect(r4.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DomainScopeRule
// ---------------------------------------------------------------------------
describe('DomainScopeRule', () => {
  const domainToolMap = new Map<string, string[]>([
    ['engineering', ['file_read', 'file_write', 'shell_exec']],
    ['analytics', ['file_read', 'db_query']],
  ]);

  it('should allow tool in domain\'s allowed list', async () => {
    const rule = new DomainScopeRule(domainToolMap);
    const ctx = createContext({ domainId: 'engineering', toolName: 'file_write' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
  });

  it('should block tool not in domain\'s allowed list', async () => {
    const rule = new DomainScopeRule(domainToolMap);
    const ctx = createContext({ domainId: 'analytics', toolName: 'shell_exec' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('shell_exec');
    expect(result.reason).toContain('analytics');
  });

  it('should allow when no domainId is set', async () => {
    const rule = new DomainScopeRule(domainToolMap);
    const ctx = createContext({ domainId: undefined, toolName: 'shell_exec' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
  });

  it('should allow when domainId not in map (no restriction)', async () => {
    const rule = new DomainScopeRule(domainToolMap);
    const ctx = createContext({ domainId: 'unknown-domain', toolName: 'shell_exec' });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ReflectAfterEditRule
// ---------------------------------------------------------------------------
describe('ReflectAfterEditRule', () => {
  let rule: ReflectAfterEditRule;

  beforeEach(() => {
    rule = new ReflectAfterEditRule();
  });

  it('should warn after file_write tool', async () => {
    const ctx = createContext({
      toolName: 'file_write',
      toolResult: { success: true, output: 'written', durationMs: 10 },
    });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Reflection recommended');
    expect(result.reason).toContain('file_write');
  });

  it('should warn after code-edit skill', async () => {
    const ctx = createContext({
      skillName: 'code-edit',
      toolName: 'some_tool',
      toolResult: { success: true, output: 'edited', durationMs: 10 },
    });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Reflection recommended');
    expect(result.reason).toContain('code-edit');
  });

  it('should not warn for file_read tool', async () => {
    const ctx = createContext({
      toolName: 'file_read',
      toolResult: { success: true, output: 'content', durationMs: 10 },
    });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should include skill name in recommendation', async () => {
    const ctx = createContext({
      skillName: 'code-edit',
      toolName: 'file_write',
    });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("skillName='code-edit'");
  });
});

// ---------------------------------------------------------------------------
// SessionIsolationRule
// ---------------------------------------------------------------------------
describe('SessionIsolationRule', () => {
  it('should allow when session is in allowed set', async () => {
    const rule = new SessionIsolationRule(new Set(['session-abc', 'session-def']));
    const ctx = createContext({ metadata: { sessionId: 'session-abc' } });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
  });

  it('should block when session is not in allowed set', async () => {
    const rule = new SessionIsolationRule(new Set(['session-abc']));
    const ctx = createContext({ metadata: { sessionId: 'session-xyz' } });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('session-xyz');
  });

  it('should allow when no sessionId in metadata', async () => {
    const rule = new SessionIsolationRule(new Set(['session-abc']));
    const ctx = createContext({ metadata: {} });

    const result = await rule.evaluate(ctx);

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createGovernedRules
// ---------------------------------------------------------------------------
describe('createGovernedRules', () => {
  it('should create all 5 governed rules', () => {
    const provider = createMockPolicyProvider();
    const rules = createGovernedRules(provider);

    expect(rules).toHaveLength(5);

    const names = rules.map((r) => r.name);
    expect(names).toContain('require-approval');
    expect(names).toContain('rate-limiter');
    expect(names).toContain('domain-scope');
    expect(names).toContain('reflect-after-edit');
    expect(names).toContain('session-isolation');
  });

  it('should accept custom options', () => {
    const provider = createMockPolicyProvider();
    const rules = createGovernedRules(provider, {
      approvalTools: ['deploy'],
      rateLimit: 50,
      rateLimitWindowMs: 30_000,
      domainToolMap: new Map([['eng', ['file_read']]]),
      allowedSessions: new Set(['s1']),
    });

    expect(rules).toHaveLength(5);
  });
});
