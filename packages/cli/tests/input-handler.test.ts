import { describe, it, expect } from 'vitest';
import { InputHandler, COMMAND_MAP } from '../src/input-handler.js';
import type { InputType } from '../src/input-handler.js';

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

describe('COMMAND_MAP', () => {
  it('should map /mcp to mcp input type', () => {
    expect(COMMAND_MAP['/mcp']).toBe('mcp');
  });

  it('should accept mcp as a valid InputType', () => {
    const mcpType: InputType = 'mcp';
    expect(mcpType).toBe('mcp');
  });

  it('should contain all expected slash commands', () => {
    expect(COMMAND_MAP['/exit']).toBe('exit');
    expect(COMMAND_MAP['/help']).toBe('help');
    expect(COMMAND_MAP['/mcp']).toBe('mcp');
    expect(COMMAND_MAP['/soul']).toBe('soul');
  });
});
