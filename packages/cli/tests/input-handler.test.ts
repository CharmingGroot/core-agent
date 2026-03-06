import { describe, it, expect } from 'vitest';
import { InputHandler } from '../src/input-handler.js';

describe('InputHandler', () => {
  it('should create an instance', () => {
    const handler = new InputHandler();
    expect(handler).toBeDefined();
  });

  it('should have start method', () => {
    const handler = new InputHandler();
    expect(typeof handler.start).toBe('function');
  });

  it('should have prompt method', () => {
    const handler = new InputHandler();
    expect(typeof handler.prompt).toBe('function');
  });

  it('should have close method', () => {
    const handler = new InputHandler();
    expect(typeof handler.close).toBe('function');
  });

  it('should not throw on close before start', () => {
    const handler = new InputHandler();
    expect(() => handler.close()).not.toThrow();
  });
});
