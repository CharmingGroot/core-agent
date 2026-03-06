import type { IRule, IRuleRegistry, RulePhase } from '@core/types';

/**
 * In-memory rule registry.
 * Manages CRUD operations for IRule instances, indexed by unique name.
 */
export class RuleRegistry implements IRuleRegistry {
  private readonly rules: Map<string, IRule> = new Map();

  /**
   * Register a rule. Throws if a rule with the same name already exists.
   */
  register(rule: IRule): void {
    if (this.rules.has(rule.name)) {
      throw new Error(
        `Rule "${rule.name}" is already registered. Unregister it first to replace.`,
      );
    }
    this.rules.set(rule.name, rule);
  }

  /**
   * Get a rule by name. Returns undefined if not found.
   */
  get(name: string): IRule | undefined {
    return this.rules.get(name);
  }

  /**
   * Check whether a rule with the given name exists.
   */
  has(name: string): boolean {
    return this.rules.has(name);
  }

  /**
   * Return all registered rules as a readonly array.
   */
  getAll(): readonly IRule[] {
    return [...this.rules.values()];
  }

  /**
   * Return all rules matching the given phase.
   */
  getByPhase(phase: RulePhase): readonly IRule[] {
    return [...this.rules.values()].filter((rule) => rule.phase === phase);
  }

  /**
   * Remove a rule by name. Returns true if the rule existed and was removed.
   */
  unregister(name: string): boolean {
    return this.rules.delete(name);
  }
}
