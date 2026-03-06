import { describe, it, expect } from 'vitest';
import { ContextBudgetTracker } from '../src/context-budget.js';
import type { ContextBudget } from '@core/types';

const TEST_BUDGET: ContextBudget = {
  totalLimit: 32768,
  reserveForResponse: 4096,
  sections: {
    system: 2048,
    tools: 3072,
    history: 23552,
  },
};

describe('ContextBudgetTracker', () => {
  it('should start with zero usage in all sections', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    const usage = tracker.usage();

    expect(usage.system.used).toBe(0);
    expect(usage.tools.used).toBe(0);
    expect(usage.history.used).toBe(0);
    expect(usage.total).toBe(0);
  });

  it('should calculate remaining from total minus reserve minus usage', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    const usage = tracker.usage();

    // remaining = 32768 - 4096 - 0 = 28672
    expect(usage.remaining).toBe(28672);
  });

  it('should track tokens added to sections', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    tracker.addToSection('system', 500);
    tracker.addToSection('tools', 1000);
    tracker.addToSection('history', 2000);

    const usage = tracker.usage();
    expect(usage.system.used).toBe(500);
    expect(usage.tools.used).toBe(1000);
    expect(usage.history.used).toBe(2000);
    expect(usage.total).toBe(3500);
    expect(usage.remaining).toBe(28672 - 3500);
  });

  it('should accumulate multiple additions to the same section', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    tracker.addToSection('history', 1000);
    tracker.addToSection('history', 2000);

    expect(tracker.usage().history.used).toBe(3000);
  });

  it('should detect when adding tokens would exceed section limit', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    tracker.addToSection('system', 2000);

    expect(tracker.wouldExceed('system', 48)).toBe(false);
    expect(tracker.wouldExceed('system', 49)).toBe(true);
  });

  it('should return false for wouldExceed when exactly at limit', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    tracker.addToSection('system', 2000);

    // 2000 + 48 = 2048 = limit, not exceeding
    expect(tracker.wouldExceed('system', 48)).toBe(false);
  });

  it('should calculate percent correctly', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    tracker.addToSection('system', 1024); // half of 2048

    const usage = tracker.usage();
    expect(usage.system.percent).toBe(50);
  });

  it('should report section limits', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    const usage = tracker.usage();

    expect(usage.system.limit).toBe(2048);
    expect(usage.tools.limit).toBe(3072);
    expect(usage.history.limit).toBe(23552);
  });

  it('should reset all usage to zero', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    tracker.addToSection('system', 500);
    tracker.addToSection('tools', 1000);
    tracker.addToSection('history', 2000);

    tracker.reset();
    const usage = tracker.usage();

    expect(usage.system.used).toBe(0);
    expect(usage.tools.used).toBe(0);
    expect(usage.history.used).toBe(0);
    expect(usage.total).toBe(0);
  });

  it('should clamp remaining to zero when over budget', () => {
    const tracker = new ContextBudgetTracker(TEST_BUDGET);
    // Add more than totalLimit - reserve
    tracker.addToSection('history', 30000);

    const usage = tracker.usage();
    expect(usage.remaining).toBe(0);
  });
});
