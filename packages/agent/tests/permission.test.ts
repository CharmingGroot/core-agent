import { describe, it, expect, vi } from 'vitest';
import { PermissionManager } from '../src/permission.js';
import type { ITool, ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';

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

  it('should use custom handler for permission-required tools', async () => {
    const handler = vi.fn().mockResolvedValue(false);
    const manager = new PermissionManager(handler);
    const tool = createMockTool('shell_exec', true);
    expect(await manager.checkPermission(tool)).toBe(false);
    expect(handler).toHaveBeenCalledWith('shell_exec');
  });

  it('should skip handler for pre-allowed tools', async () => {
    const handler = vi.fn().mockResolvedValue(false);
    const manager = new PermissionManager(handler);
    manager.allowTool('shell_exec');
    const tool = createMockTool('shell_exec', true);
    expect(await manager.checkPermission(tool)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should revoke tool permission', () => {
    const manager = new PermissionManager();
    manager.allowTool('shell_exec');
    expect(manager.isAllowed('shell_exec')).toBe(true);
    manager.revokeTool('shell_exec');
    expect(manager.isAllowed('shell_exec')).toBe(false);
  });

  it('should clear all allowed tools', () => {
    const manager = new PermissionManager();
    manager.allowTool('a');
    manager.allowTool('b');
    manager.clearAllowed();
    expect(manager.isAllowed('a')).toBe(false);
    expect(manager.isAllowed('b')).toBe(false);
  });
});
