import { describe, it, expect, beforeEach } from 'vitest';
import { GitStatusTool } from '../src/git-status.js';
import { GitDiffTool } from '../src/git-diff.js';
import { GitLogTool } from '../src/git-log.js';
import type { AgentConfig } from '@cli-agent/core';
import { RunContext } from '@cli-agent/core';

const TEST_CONFIG: AgentConfig = {
  provider: {
    providerId: 'test', model: 'test',
    auth: { type: 'api-key' as const, apiKey: 'test' },
    maxTokens: 4096, temperature: 0.7,
  },
  maxIterations: 10,
  workingDirectory: process.cwd(), // monorepo root — actual git repo
};

describe('GitStatusTool', () => {
  let tool: GitStatusTool;
  let context: RunContext;

  beforeEach(() => {
    tool = new GitStatusTool();
    context = new RunContext(TEST_CONFIG);
  });

  it('should have correct name and no permission required', () => {
    expect(tool.name).toBe('git_status');
    expect(tool.requiresPermission).toBe(false);
  });

  it('should describe with no parameters', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('git_status');
    expect(desc.parameters).toHaveLength(0);
  });

  it('should return status output from real git repo', async () => {
    const result = await tool.execute({}, context);
    expect(result.success).toBe(true);
    // Should contain branch info (## master or similar)
    expect(result.output).toContain('##');
  });
});

describe('GitDiffTool', () => {
  let tool: GitDiffTool;
  let context: RunContext;

  beforeEach(() => {
    tool = new GitDiffTool();
    context = new RunContext(TEST_CONFIG);
  });

  it('should have correct name and no permission required', () => {
    expect(tool.name).toBe('git_diff');
    expect(tool.requiresPermission).toBe(false);
  });

  it('should describe with staged and target parameters', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('git_diff');
    expect(desc.parameters.length).toBeGreaterThanOrEqual(2);
    expect(desc.parameters.map(p => p.name)).toContain('staged');
    expect(desc.parameters.map(p => p.name)).toContain('target');
  });

  it('should return diff output (may be empty if clean)', async () => {
    const result = await tool.execute({}, context);
    expect(result.success).toBe(true);
    // Output can be empty or contain diff — both valid
    expect(typeof result.output).toBe('string');
  });

  it('should accept staged flag', async () => {
    const result = await tool.execute({ staged: true }, context);
    expect(result.success).toBe(true);
  });
});

describe('GitLogTool', () => {
  let tool: GitLogTool;
  let context: RunContext;

  beforeEach(() => {
    tool = new GitLogTool();
    context = new RunContext(TEST_CONFIG);
  });

  it('should have correct name and no permission required', () => {
    expect(tool.name).toBe('git_log');
    expect(tool.requiresPermission).toBe(false);
  });

  it('should describe with count, oneline, file parameters', () => {
    const desc = tool.describe();
    expect(desc.parameters.map(p => p.name)).toEqual(['count', 'oneline', 'file']);
  });

  it('should return commit history', async () => {
    const result = await tool.execute({ count: 3 }, context);
    expect(result.success).toBe(true);
    // Should have at least one commit hash (7+ chars hex)
    expect(result.output).toMatch(/[0-9a-f]{7}/);
  });

  it('should support verbose format', async () => {
    const result = await tool.execute({ count: 2, oneline: false }, context);
    expect(result.success).toBe(true);
    // Verbose format is longer than oneline
    expect(result.output.length).toBeGreaterThan(20);
  });

  it('should show log for specific file', async () => {
    const result = await tool.execute({ count: 3, file: 'package.json' }, context);
    expect(result.success).toBe(true);
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('should cap count at max 50', async () => {
    const result = await tool.execute({ count: 999 }, context);
    expect(result.success).toBe(true);
    // Should not return more than 50 lines in oneline mode
    const lines = result.output.trim().split('\n').filter(l => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(50);
  });
});
