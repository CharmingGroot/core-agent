import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSearchTool } from '../src/file-search.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-search');

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', apiKey: 'test', maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: TEST_DIR,
};

describe('FileSearchTool', () => {
  let tool: FileSearchTool;
  let context: RunContext;

  beforeEach(async () => {
    tool = new FileSearchTool();
    context = new RunContext(TEST_CONFIG);
    await mkdir(join(TEST_DIR, 'src'), { recursive: true });
    await writeFile(join(TEST_DIR, 'src', 'index.ts'), 'export {}');
    await writeFile(join(TEST_DIR, 'src', 'util.ts'), 'export {}');
    await writeFile(join(TEST_DIR, 'readme.md'), '# Test');
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should have correct name and no permission required', () => {
    expect(tool.name).toBe('file_search');
    expect(tool.requiresPermission).toBe(false);
  });

  it('should find files matching pattern', async () => {
    const result = await tool.execute({ pattern: '**/*.ts' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('index.ts');
    expect(result.output).toContain('util.ts');
    expect(result.output).not.toContain('readme.md');
  });

  it('should report count in metadata', async () => {
    const result = await tool.execute({ pattern: '**/*.ts' }, context);
    expect(result.metadata?.['count']).toBe(2);
  });

  it('should report no files found', async () => {
    const result = await tool.execute({ pattern: '**/*.xyz' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('No files found');
  });

  it('should fail for missing pattern', async () => {
    const result = await tool.execute({}, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('pattern');
  });
});
