import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from '../src/rule-engine.js';
import { RuleRegistry } from '../src/rule-registry.js';
import type {
  IRule,
  RuleContext,
  RuleResult,
  RulePhase,
  RuleSeverity,
} from '@core/types';

function createMockRule(
  name: string,
  phase: RulePhase,
  severity: RuleSeverity,
  evaluateFn: (ctx: RuleContext) => Promise<RuleResult>,
): IRule {
  return {
    name,
    phase,
    severity,
    description: `Mock: ${name}`,
    evaluate: evaluateFn,
  };
}

function createContext(overrides?: Partial<RuleContext>): RuleContext {
  return {
    agentId: 'agent-1',
    skillName: 'test-skill',
    toolName: 'shell_exec',
    toolParams: { command: 'echo hello' },
    userId: 'user-1',
    metadata: {},
    ...overrides,
  };
}

describe('RuleEngine', () => {
  let registry: RuleRegistry;
  let engine: RuleEngine;

  beforeEach(() => {
    registry = new RuleRegistry();
    engine = new RuleEngine(registry);
  });

  describe('evaluatePre', () => {
    it('should allow when no pre rules are registered', async () => {
      const result = await engine.evaluatePre(createContext());
      expect(result.allowed).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    it('should allow when all pre rules return allowed', async () => {
      registry.register(
        createMockRule('pass-1', 'pre', 'block', async () => ({ allowed: true })),
      );
      registry.register(
        createMockRule('pass-2', 'pre', 'warn', async () => ({ allowed: true })),
      );

      const result = await engine.evaluatePre(createContext());
      expect(result.allowed).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should block when a block-severity rule returns allowed=false', async () => {
      registry.register(
        createMockRule('blocker', 'pre', 'block', async () => ({
          allowed: false,
          reason: 'Dangerous operation',
        })),
      );

      const result = await engine.evaluatePre(createContext());
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Dangerous operation');
    });

    it('should allow when only warn-severity rules return allowed=false', async () => {
      registry.register(
        createMockRule('warner', 'pre', 'warn', async () => ({
          allowed: false,
          reason: 'Just a warning',
        })),
      );

      const result = await engine.evaluatePre(createContext());
      expect(result.allowed).toBe(true);
      expect(result.results[0].allowed).toBe(false);
      expect(result.results[0].reason).toBe('Just a warning');
    });

    it('should merge modifications from multiple rules', async () => {
      registry.register(
        createMockRule('mod-1', 'pre', 'warn', async () => ({
          allowed: true,
          modifications: { timeout: 5000, verbose: true },
        })),
      );
      registry.register(
        createMockRule('mod-2', 'pre', 'warn', async () => ({
          allowed: true,
          modifications: { verbose: false, retries: 3 },
        })),
      );

      const result = await engine.evaluatePre(createContext());
      expect(result.allowed).toBe(true);
      expect(result.modifications).toEqual({
        timeout: 5000,
        verbose: false,
        retries: 3,
      });
    });

    it('should not include modifications key when no rules provide modifications', async () => {
      registry.register(
        createMockRule('simple', 'pre', 'block', async () => ({ allowed: true })),
      );

      const result = await engine.evaluatePre(createContext());
      expect(result.modifications).toBeUndefined();
    });

    it('should not run post rules during pre evaluation', async () => {
      let postCalled = false;
      registry.register(
        createMockRule('post-rule', 'post', 'log', async () => {
          postCalled = true;
          return { allowed: true };
        }),
      );

      await engine.evaluatePre(createContext());
      expect(postCalled).toBe(false);
    });
  });

  describe('evaluatePost', () => {
    it('should return empty results when no post rules exist', async () => {
      const result = await engine.evaluatePost(createContext());
      expect(result.results).toHaveLength(0);
      expect(result.filteredOutput).toBeUndefined();
    });

    it('should collect all post rule results', async () => {
      registry.register(
        createMockRule('post-1', 'post', 'log', async () => ({ allowed: true })),
      );
      registry.register(
        createMockRule('post-2', 'post', 'warn', async () => ({
          allowed: false,
          reason: 'Warning from post',
        })),
      );

      const result = await engine.evaluatePost(createContext());
      expect(result.results).toHaveLength(2);
    });

    it('should use the last filteredOutput when multiple rules provide it', async () => {
      registry.register(
        createMockRule('filter-1', 'post', 'warn', async () => ({
          allowed: true,
          filteredOutput: 'first filtered',
        })),
      );
      registry.register(
        createMockRule('filter-2', 'post', 'warn', async () => ({
          allowed: true,
          filteredOutput: 'second filtered',
        })),
      );

      const result = await engine.evaluatePost(createContext());
      expect(result.filteredOutput).toBe('second filtered');
    });

    it('should not run pre rules during post evaluation', async () => {
      let preCalled = false;
      registry.register(
        createMockRule('pre-rule', 'pre', 'block', async () => {
          preCalled = true;
          return { allowed: false, reason: 'should not run' };
        }),
      );

      const result = await engine.evaluatePost(createContext());
      expect(preCalled).toBe(false);
      expect(result.results).toHaveLength(0);
    });
  });
});
