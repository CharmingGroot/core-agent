import { describe, it, expect } from 'vitest';
import { createLogger, createChildLogger, getRootLogger } from '../src/logger.js';

describe('Logger', () => {
  it('should create a named logger', () => {
    const logger = createLogger('test-module');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should create a logger with custom level', () => {
    const logger = createLogger('debug-module', 'debug');
    expect(logger.level).toBe('debug');
  });

  it('should return root logger', () => {
    const root = getRootLogger();
    expect(root).toBeDefined();
    expect(typeof root.info).toBe('function');
  });

  it('should return same root logger instance', () => {
    const root1 = getRootLogger();
    const root2 = getRootLogger();
    expect(root1).toBe(root2);
  });

  it('should create a child logger', () => {
    const child = createChildLogger('child-module');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});
