import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWriteTool } from '../src/file-write.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-write');

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: TEST_DIR,
};

describe('FileWriteTool', () => {
  let tool: FileWriteTool;
  let context: RunContext;

  beforeEach(async () => {
    tool = new FileWriteTool();
    context = new RunContext(TEST_CONFIG);
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should have correct name and require permission', () => {
    expect(tool.name).toBe('file_write');
    expect(tool.requiresPermission).toBe(true);
  });

  it('should write a file successfully', async () => {
    const result = await tool.execute(
      { path: 'output.txt', content: 'written content' },
      context
    );
    expect(result.success).toBe(true);
    const content = await readFile(join(TEST_DIR, 'output.txt'), 'utf-8');
    expect(content).toBe('written content');
  });

  it('should create nested directories', async () => {
    const result = await tool.execute(
      { path: 'sub/dir/file.txt', content: 'nested' },
      context
    );
    expect(result.success).toBe(true);
    const content = await readFile(join(TEST_DIR, 'sub/dir/file.txt'), 'utf-8');
    expect(content).toBe('nested');
  });

  it('should fail for missing path', async () => {
    const result = await tool.execute({ content: 'hello' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });

  it('should fail for missing content', async () => {
    const result = await tool.execute({ path: 'test.txt' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });

  it('should reject path traversal with ../', async () => {
    const result = await tool.execute({ path: '../../tmp/evil.txt', content: 'bad' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal denied');
  });
});
