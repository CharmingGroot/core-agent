import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ShellExecTool } from '../src/shell-exec.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-shell');

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', apiKey: 'test', maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: TEST_DIR,
};

describe('ShellExecTool', () => {
  let tool: ShellExecTool;
  let context: RunContext;

  beforeEach(async () => {
    tool = new ShellExecTool();
    context = new RunContext(TEST_CONFIG);
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should have correct name and require permission', () => {
    expect(tool.name).toBe('shell_exec');
    expect(tool.requiresPermission).toBe(true);
  });

  it('should execute a simple command', async () => {
    const result = await tool.execute({ command: 'echo hello' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('hello');
  });

  it('should fail for missing command', async () => {
    const result = await tool.execute({}, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('command');
  });

  it('should report failure for bad command', async () => {
    const result = await tool.execute(
      { command: 'nonexistent_command_xyz_123' },
      context
    );
    expect(result.success).toBe(false);
  });

  it('should describe itself', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('shell_exec');
    expect(desc.parameters.length).toBeGreaterThan(0);
  });
});
