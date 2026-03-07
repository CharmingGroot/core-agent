import { describe, it, expect, vi } from 'vitest';
import { PermissionManager } from '../src/permission.js';
import type { ApprovalLevel } from '../src/permission.js';
import type { ITool } from '@cli-agent/core';

function createMockTool(name: string, requiresPermission: boolean): ITool {
  return {
    name,
    requiresPermission,
    describe: () => ({ name, description: '', parameters: [] }),
    execute: async () => ({ success: true, output: '' }),
  };
}

describe('PermissionManager', () => {
  it('should auto-approve tools that do not require permission', async () => {
    const manager = new PermissionManager();
    const tool = createMockTool('file_read', false);
    expect(await manager.checkPermission(tool)).toBe(true);
  });

  it('should auto-approve with default handler', async () => {
    const manager = new PermissionManager();
    const tool = createMockTool('shell_exec', true);
    expect(await manager.checkPermission(tool)).toBe(true);
  });

  it('should pass params to handler', async () => {
    const handler = vi.fn().mockResolvedValue('session');
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);
    const params = { command: 'ls -la' };

    await manager.checkPermission(tool, params);
    expect(handler).toHaveBeenCalledWith('shell_exec', params);
  });

  it('should deny when handler returns false', async () => {
    const handler = vi.fn().mockResolvedValue(false);
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);
    expect(await manager.checkPermission(tool, { command: 'rm -rf /' })).toBe(false);
  });

  it('should deny when handler returns "deny"', async () => {
    const handler = vi.fn().mockResolvedValue('deny' as ApprovalLevel);
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);
    expect(await manager.checkPermission(tool)).toBe(false);
  });

  // --- Approval levels ---

  it('should cache on "session" level', async () => {
    const handler = vi.fn().mockResolvedValue('session' as ApprovalLevel);
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);

    await manager.checkPermission(tool, { command: 'ls' });
    await manager.checkPermission(tool, { command: 'pwd' });

    // Handler called only once — second call uses cache
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should NOT cache on "once" level', async () => {
    const handler = vi.fn().mockResolvedValue('once' as ApprovalLevel);
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);

    await manager.checkPermission(tool, { command: 'ls' });
    await manager.checkPermission(tool, { command: 'pwd' });

    // Handler called every time
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should cache on "always" level and invoke persist callback', async () => {
    const handler = vi.fn().mockResolvedValue('always' as ApprovalLevel);
    const onPersist = vi.fn();
    const manager = new PermissionManager(handler, onPersist);
    const tool = createMockTool('shell_exec', true);

    await manager.checkPermission(tool, { command: 'ls' });
    expect(onPersist).toHaveBeenCalledWith('shell_exec');

    await manager.checkPermission(tool, { command: 'pwd' });
    expect(handler).toHaveBeenCalledTimes(1); // cached
  });

  it('should treat boolean true as "session"', async () => {
    const handler = vi.fn().mockResolvedValue(true);
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);

    await manager.checkPermission(tool);
    await manager.checkPermission(tool);

    expect(handler).toHaveBeenCalledTimes(1); // cached like session
  });

  // --- allowTool / revokeTool ---

  it('should skip handler for pre-allowed tools', async () => {
    const handler = vi.fn().mockResolvedValue('deny');
    const manager = new PermissionManager(handler);
    manager.allowTool('shell_exec');
    const tool = createMockTool('shell_exec', true);
    expect(await manager.checkPermission(tool)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support allowTool with "always" level', () => {
    const manager = new PermissionManager();
    manager.allowTool('shell_exec', 'always');
    expect(manager.isAllowed('shell_exec')).toBe(true);
  });

  it('should revoke tool permission from both levels', () => {
    const manager = new PermissionManager();
    manager.allowTool('a', 'session');
    manager.allowTool('b', 'always');
    expect(manager.isAllowed('a')).toBe(true);
    expect(manager.isAllowed('b')).toBe(true);
    manager.revokeTool('a');
    manager.revokeTool('b');
    expect(manager.isAllowed('a')).toBe(false);
    expect(manager.isAllowed('b')).toBe(false);
  });

  it('should clear session only', () => {
    const manager = new PermissionManager();
    manager.allowTool('a', 'session');
    manager.allowTool('b', 'always');
    manager.clearSession();
    expect(manager.isAllowed('a')).toBe(false);
    expect(manager.isAllowed('b')).toBe(true); // always survives
  });

  it('should clear all', () => {
    const manager = new PermissionManager();
    manager.allowTool('a', 'session');
    manager.allowTool('b', 'always');
    manager.clearAll();
    expect(manager.isAllowed('a')).toBe(false);
    expect(manager.isAllowed('b')).toBe(false);
  });
});
