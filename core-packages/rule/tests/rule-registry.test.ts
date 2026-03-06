import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry } from '../src/rule-registry.js';
import type { IRule, RuleContext, RuleResult, RulePhase, RuleSeverity } from '@core/types';

function createMockRule(overrides: Partial<IRule> & { name: string }): IRule {
  return {
    phase: 'pre' as RulePhase,
    severity: 'block' as RuleSeverity,
    description: `Mock rule: ${overrides.name}`,
    evaluate: async (_ctx: RuleContext): Promise<RuleResult> => ({ allowed: true }),
    ...overrides,
  };
}

describe('RuleRegistry', () => {
  let registry: RuleRegistry;

  beforeEach(() => {
    registry = new RuleRegistry();
  });

  it('should register and retrieve a rule by name', () => {
    const rule = createMockRule({ name: 'test-rule' });
    registry.register(rule);

    const retrieved = registry.get('test-rule');
    expect(retrieved).toBe(rule);
  });

  it('should throw on duplicate registration', () => {
    const rule = createMockRule({ name: 'duplicate' });
    registry.register(rule);

    expect(() => registry.register(rule)).toThrow(
      'Rule "duplicate" is already registered',
    );
  });

  it('should return undefined for non-existent rule', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should correctly report has() for existing and missing rules', () => {
    const rule = createMockRule({ name: 'check-rule' });
    registry.register(rule);

    expect(registry.has('check-rule')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('should return all registered rules via getAll()', () => {
    const ruleA = createMockRule({ name: 'rule-a' });
    const ruleB = createMockRule({ name: 'rule-b' });
    registry.register(ruleA);
    registry.register(ruleB);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(ruleA);
    expect(all).toContain(ruleB);
  });

  it('should filter rules by phase via getByPhase()', () => {
    const preRule = createMockRule({ name: 'pre-rule', phase: 'pre' });
    const postRule = createMockRule({ name: 'post-rule', phase: 'post' });
    const anotherPre = createMockRule({ name: 'another-pre', phase: 'pre' });
    registry.register(preRule);
    registry.register(postRule);
    registry.register(anotherPre);

    const preRules = registry.getByPhase('pre');
    expect(preRules).toHaveLength(2);
    expect(preRules).toContain(preRule);
    expect(preRules).toContain(anotherPre);

    const postRules = registry.getByPhase('post');
    expect(postRules).toHaveLength(1);
    expect(postRules).toContain(postRule);
  });

  it('should unregister a rule and return true', () => {
    const rule = createMockRule({ name: 'removable' });
    registry.register(rule);

    const removed = registry.unregister('removable');
    expect(removed).toBe(true);
    expect(registry.has('removable')).toBe(false);
    expect(registry.get('removable')).toBeUndefined();
  });

  it('should return false when unregistering a non-existent rule', () => {
    const removed = registry.unregister('ghost');
    expect(removed).toBe(false);
  });

  it('should allow re-registration after unregister', () => {
    const ruleV1 = createMockRule({ name: 'versioned', description: 'v1' });
    const ruleV2 = createMockRule({ name: 'versioned', description: 'v2' });

    registry.register(ruleV1);
    registry.unregister('versioned');
    registry.register(ruleV2);

    expect(registry.get('versioned')?.description).toBe('v2');
  });
});
