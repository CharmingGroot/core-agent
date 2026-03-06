import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileReadTool } from '../src/file-read.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-read');

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: TEST_DIR,
};

describe('FileReadTool', () => {
  let tool: FileReadTool;
  let context: RunContext;

  beforeEach(async () => {
    tool = new FileReadTool();
    context = new RunContext(TEST_CONFIG);
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(join(TEST_DIR, 'test.txt'), 'hello world', 'utf-8');
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should have correct name and no permission required', () => {
    expect(tool.name).toBe('file_read');
    expect(tool.requiresPermission).toBe(false);
  });

  it('should describe itself', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('file_read');
    expect(desc.parameters.length).toBeGreaterThan(0);
  });

  it('should read a file successfully', async () => {
    const result = await tool.execute({ path: 'test.txt' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello world');
  });

  it('should fail for missing path param', async () => {
    const result = await tool.execute({}, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });

  it('should fail for non-existent file', async () => {
    const result = await tool.execute({ path: 'nonexistent.txt' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to read file');
  });
});
