/**
 * Context budget tracking.
 * Manages token usage per section and detects when sections
 * would exceed their allocated budget.
 */

import type {
  ContextBudget,
  SectionUsage,
  TokenUsageInfo,
} from '@core/types';

/** Section names that can be tracked */
export type SectionName = 'system' | 'tools' | 'history';

/**
 * Tracks token usage across context window sections.
 * Ensures no section exceeds its allocated budget and
 * computes remaining capacity from total minus reserve minus usage.
 */
export class ContextBudgetTracker {
  private readonly budget: ContextBudget;
  private sectionUsage: Record<SectionName, number>;

  constructor(budget: ContextBudget) {
    this.budget = budget;
    this.sectionUsage = {
      system: 0,
      tools: 0,
      history: 0,
    };
  }

  /**
   * Add tokens to a section.
   * Does not prevent exceeding — use wouldExceed() to check first.
   */
  addToSection(section: SectionName, tokens: number): void {
    this.sectionUsage[section] += tokens;
  }

  /**
   * Check if adding tokens to a section would exceed its limit.
   */
  wouldExceed(section: SectionName, tokens: number): boolean {
    const currentUsage = this.sectionUsage[section];
    const limit = this.budget.sections[section];
    return currentUsage + tokens > limit;
  }

  /**
   * Get current usage information for all sections.
   */
  usage(): SectionUsage {
    const totalUsed =
      this.sectionUsage.system +
      this.sectionUsage.tools +
      this.sectionUsage.history;

    const remaining =
      this.budget.totalLimit -
      this.budget.reserveForResponse -
      totalUsed;

    return {
      system: this.buildUsageInfo('system'),
      tools: this.buildUsageInfo('tools'),
      history: this.buildUsageInfo('history'),
      total: totalUsed,
      remaining: Math.max(0, remaining),
    };
  }

  /**
   * Reset all section usage to zero.
   */
  reset(): void {
    this.sectionUsage = {
      system: 0,
      tools: 0,
      history: 0,
    };
  }

  private buildUsageInfo(section: SectionName): TokenUsageInfo {
    const used = this.sectionUsage[section];
    const limit = this.budget.sections[section];
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

    return { used, limit, percent };
  }
}
