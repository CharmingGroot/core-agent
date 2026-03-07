import { describe, it, expect, vi } from 'vitest';
import { createPermissionHandler } from '../src/permission-factory.js';
import type { PermissionFactoryConfig } from '../src/permission-factory.js';
import type { IPolicyProvider } from '@core/types';
import { RuleRegistry, RuleEngine } from '@core/rule';
import type { IRule, RuleContext, RuleResult } from '@core/types';

/** Minimal OpenPolicy-like mock — everything allowed, no approval */
function createOpenPolicyMock(): IPolicyProvider {
  return {
    canUseSkill: vi.fn().mockResolvedValue(true),
    canUseTool: vi.fn().mockResolvedValue(true),
    requiresApproval: vi.fn().mockResolvedValue(false),
    requestApproval: vi.fn().mockResolvedValue({ status: 'approved', timestamp: new Date() }),
    recordAction: vi.fn().mockResolvedValue(undefined),
    getAllowedSkills: vi.fn().mockResolvedValue([]),
    getAllowedTools: vi.fn().mockResolvedValue([]),
    getProfile: vi.fn().mockResolvedValue(null),
  };
}

/** GovernedPolicy-like mock — restricted */
function createGovernedPolicyMock(overrides: Partial<IPolicyProvider> = {}): IPolicyProvider {
  return {
    ...createOpenPolicyMock(),
    ...overrides,
  };
}

/** Rule that blocks destructive commands */
function createBlockingRule(pattern: RegExp): IRule {
  return {
    name: 'block-dangerous',
    phase: 'pre',
    severity: 'block',
    evaluate: vi.fn().mockImplementation(async (ctx: RuleContext): Promise<RuleResult> => {
      const command = (ctx.toolParams as Record<string, unknown>)['command'];
      if (typeof command === 'string' && pattern.test(command)) {
        return { allowed: false, reason: `Blocked: matches ${pattern}` };
      }
      return { allowed: true };
    }),
  };
}

describe('createPermissionHandler', () => {
  // --- Standalone (OpenPolicy) ---

  it('should allow everything with OpenPolicy', async () => {
    const handler = createPermissionHandler({
      policy: createOpenPolicyMock(),
      userId: 'user-1',
    });

    const result = await handler('shell_exec', { command: 'ls' });
    expect(result).toBe('session');
  });

  // --- Rule engine integration ---

  it('should deny when rule engine blocks', async () => {
    const registry = new RuleRegistry();
    registry.register(createBlockingRule(/rm\s+-rf/));
    const engine = new RuleEngine(registry);

    const handler = createPermissionHandler({
      policy: createOpenPolicyMock(),
      userId: 'user-1',
      ruleEngine: engine,
    });

    const result = await handler('shell_exec', { command: 'rm -rf /' });
    expect(result).toBe('deny');
  });

  it('should allow when rule engine passes', async () => {
    const registry = new RuleRegistry();
    registry.register(createBlockingRule(/rm\s+-rf/));
    const engine = new RuleEngine(registry);

    const handler = createPermissionHandler({
      policy: createOpenPolicyMock(),
      userId: 'user-1',
      ruleEngine: engine,
    });

    const result = await handler('shell_exec', { command: 'ls -la' });
    expect(result).toBe('session');
  });

  // --- Governance policy ---

  it('should deny when policy.canUseTool returns false', async () => {
    const policy = createGovernedPolicyMock({
      canUseTool: vi.fn().mockResolvedValue(false),
    });

    const handler = createPermissionHandler({ policy, userId: 'user-1' });
    const result = await handler('shell_exec', { command: 'ls' });
    expect(result).toBe('deny');
  });

  it('should deny when approval required but no interactive handler', async () => {
    const policy = createGovernedPolicyMock({
      requiresApproval: vi.fn().mockResolvedValue(true),
    });

    const handler = createPermissionHandler({ policy, userId: 'user-1' });
    const result = await handler('shell_exec', { command: 'ls' });
    expect(result).toBe('deny');
  });

  it('should delegate to interactive handler when approval required', async () => {
    const policy = createGovernedPolicyMock({
      requiresApproval: vi.fn().mockResolvedValue(true),
    });
    const interactiveHandler = vi.fn().mockResolvedValue('once');

    const handler = createPermissionHandler({
      policy,
      userId: 'user-1',
      interactiveHandler,
    });

    const result = await handler('shell_exec', { command: 'ls' });
    expect(result).toBe('once');
    expect(interactiveHandler).toHaveBeenCalledWith('shell_exec', { command: 'ls' });
  });

  // --- Rule + Governance combined ---

  it('should check rules BEFORE governance policy', async () => {
    const callOrder: string[] = [];

    const registry = new RuleRegistry();
    const rule: IRule = {
      name: 'tracking-rule',
      phase: 'pre',
      severity: 'block',
      evaluate: vi.fn().mockImplementation(async () => {
        callOrder.push('rule');
        return { allowed: false, reason: 'blocked by rule' };
      }),
    };
    registry.register(rule);
    const engine = new RuleEngine(registry);

    const policy = createGovernedPolicyMock({
      canUseTool: vi.fn().mockImplementation(async () => {
        callOrder.push('policy');
        return true;
      }),
    });

    const handler = createPermissionHandler({
      policy,
      userId: 'user-1',
      ruleEngine: engine,
    });

    const result = await handler('shell_exec', { command: 'dangerous' });
    expect(result).toBe('deny');
    // Rule should be checked first, policy should NOT be called
    expect(callOrder).toEqual(['rule']);
  });
});
