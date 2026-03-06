import { describe, it, expect } from 'vitest';
import { RunContext } from '../src/run-context.js';
import { EventBus } from '../src/event-bus.js';
import type { AgentConfig } from '../src/config.js';

const TEST_CONFIG: AgentConfig = {
  provider: {
    providerId: 'test',
    model: 'test-model',
    apiKey: 'test-key',
    maxTokens: 4096,
    temperature: 0.7,
  },
  maxIterations: 50,
  workingDirectory: '/tmp/test',
};

describe('RunContext', () => {
  it('should generate a unique runId', () => {
    const ctx1 = new RunContext(TEST_CONFIG);
    const ctx2 = new RunContext(TEST_CONFIG);
    expect(ctx1.runId).toBeTruthy();
    expect(ctx2.runId).toBeTruthy();
    expect(ctx1.runId).not.toBe(ctx2.runId);
  });

  it('should use provided EventBus', () => {
    const bus = new EventBus();
    const ctx = new RunContext(TEST_CONFIG, bus);
    expect(ctx.eventBus).toBe(bus);
  });

  it('should create a default EventBus if none provided', () => {
    const ctx = new RunContext(TEST_CONFIG);
    expect(ctx.eventBus).toBeInstanceOf(EventBus);
  });

  it('should expose config and workingDirectory', () => {
    const ctx = new RunContext(TEST_CONFIG);
    expect(ctx.config).toBe(TEST_CONFIG);
    expect(ctx.workingDirectory).toBe('/tmp/test');
  });

  it('should set and get metadata', () => {
    const ctx = new RunContext(TEST_CONFIG);
    ctx.setMetadata('key', 'value');
    expect(ctx.getMetadata('key')).toBe('value');
  });

  it('should return undefined for missing metadata', () => {
    const ctx = new RunContext(TEST_CONFIG);
    expect(ctx.getMetadata('missing')).toBeUndefined();
  });

  it('should return all metadata', () => {
    const ctx = new RunContext(TEST_CONFIG);
    ctx.setMetadata('a', 1);
    ctx.setMetadata('b', 'two');
    const all = ctx.getAllMetadata();
    expect(all.size).toBe(2);
    expect(all.get('a')).toBe(1);
    expect(all.get('b')).toBe('two');
  });

  it('should support abort', () => {
    const ctx = new RunContext(TEST_CONFIG);
    expect(ctx.isAborted).toBe(false);
    ctx.abort('user cancelled');
    expect(ctx.isAborted).toBe(true);
    expect(ctx.signal.aborted).toBe(true);
  });

  it('should have a createdAt timestamp', () => {
    const before = new Date();
    const ctx = new RunContext(TEST_CONFIG);
    const after = new Date();
    expect(ctx.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ctx.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
