import type { IRuleRegistry, RuleContext, RuleResult } from '@core/types';

/**
 * Result of evaluating all pre-phase rules.
 */
export interface PreEvaluationResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly modifications?: Record<string, unknown>;
  readonly results: readonly RuleResult[];
}

/**
 * Result of evaluating all post-phase rules.
 */
export interface PostEvaluationResult {
  readonly results: readonly RuleResult[];
  readonly filteredOutput?: string;
}

/**
 * Rule evaluation engine.
 * Runs registered rules from an IRuleRegistry against a RuleContext.
 */
export class RuleEngine {
  private readonly registry: IRuleRegistry;

  constructor(registry: IRuleRegistry) {
    this.registry = registry;
  }

  /**
   * Evaluate all 'pre' phase rules against the given context.
   *
   * - If ANY rule with severity 'block' returns allowed=false, the result is blocked.
   * - If rules with severity 'warn' return allowed=false, warnings are collected but
   *   the overall result remains allowed.
   * - Modifications from all rules are merged (later rules overwrite earlier keys).
   */
  async evaluatePre(context: RuleContext): Promise<PreEvaluationResult> {
    const preRules = this.registry.getByPhase('pre');
    const results: RuleResult[] = [];
    let blocked = false;
    let blockReason: string | undefined;
    const mergedModifications: Record<string, unknown> = {};

    for (const rule of preRules) {
      const result = await rule.evaluate(context);
      results.push(result);

      if (!result.allowed && rule.severity === 'block') {
        blocked = true;
        blockReason = result.reason ?? `Blocked by rule "${rule.name}"`;
      }

      if (result.modifications) {
        Object.assign(mergedModifications, result.modifications);
      }
    }

    const hasModifications = Object.keys(mergedModifications).length > 0;

    return {
      allowed: !blocked,
      reason: blocked ? blockReason : undefined,
      modifications: hasModifications ? mergedModifications : undefined,
      results,
    };
  }

  /**
   * Evaluate all 'post' phase rules against the given context.
   *
   * - Collects all rule results.
   * - If any rule provides a filteredOutput, the last one wins.
   */
  async evaluatePost(context: RuleContext): Promise<PostEvaluationResult> {
    const postRules = this.registry.getByPhase('post');
    const results: RuleResult[] = [];
    let filteredOutput: string | undefined;

    for (const rule of postRules) {
      const result = await rule.evaluate(context);
      results.push(result);

      if (result.filteredOutput !== undefined) {
        filteredOutput = result.filteredOutput;
      }
    }

    return {
      results,
      filteredOutput,
    };
  }
}
