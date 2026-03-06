import { describe, it, expect } from 'vitest';
import { createToolRegistry } from '../src/tool-registry.js';

describe('ToolRegistry', () => {
  it('should create registry with default tools', () => {
    const registry = createToolRegistry();
    expect(registry.has('file_read')).toBe(true);
    expect(registry.has('file_write')).toBe(true);
    expect(registry.has('file_search')).toBe(true);
    expect(registry.has('shell_exec')).toBe(true);
    expect(registry.has('reflect')).toBe(true);
  });

  it('should have 5 default tools', () => {
    const registry = createToolRegistry();
    expect(registry.size).toBe(5);
  });

  it('should return tool instances', () => {
    const registry = createToolRegistry();
    const fileRead = registry.get('file_read');
    expect(fileRead.name).toBe('file_read');
    expect(typeof fileRead.execute).toBe('function');
    expect(typeof fileRead.describe).toBe('function');
  });

  it('should allow adding custom tools', () => {
    const registry = createToolRegistry();
    const mockTool = {
      name: 'custom',
      requiresPermission: false,
      describe: () => ({ name: 'custom', description: 'Custom tool', parameters: [] }),
      execute: async () => ({ success: true, output: 'ok' }),
    };
    registry.register('custom', mockTool);
    expect(registry.has('custom')).toBe(true);
    expect(registry.size).toBe(6);
  });
});
