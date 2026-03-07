import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileEditTool } from '../src/file-edit.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-edit');

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: TEST_DIR,
};

describe('FileEditTool', () => {
  let tool: FileEditTool;
  let context: RunContext;

  beforeEach(async () => {
    tool = new FileEditTool();
    context = new RunContext(TEST_CONFIG);
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should describe itself', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('file_edit');
    expect(desc.parameters.length).toBe(4);
  });

  it('should replace a unique string', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    await writeFile(filePath, 'const x = 1;\nconst y = 2;\n', 'utf-8');

    const result = await tool.execute(
      { path: 'test.ts', old_string: 'const x = 1;', new_string: 'const x = 42;' },
      context
    );

    expect(result.success).toBe(true);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('const x = 42;\nconst y = 2;\n');
  });

  it('should fail when old_string not found', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    await writeFile(filePath, 'hello world', 'utf-8');

    const result = await tool.execute(
      { path: 'test.ts', old_string: 'not found', new_string: 'replacement' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found in file');
  });

  it('should fail when old_string has multiple matches without replace_all', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    await writeFile(filePath, 'foo bar foo baz foo', 'utf-8');

    const result = await tool.execute(
      { path: 'test.ts', old_string: 'foo', new_string: 'qux' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('3 occurrences');
  });

  it('should replace all occurrences with replace_all=true', async () => {
    const filePath = join(TEST_DIR, 'test.ts');
    await writeFile(filePath, 'foo bar foo baz foo', 'utf-8');

    const result = await tool.execute(
      { path: 'test.ts', old_string: 'foo', new_string: 'qux', replace_all: true },
      context
    );

    expect(result.success).toBe(true);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('qux bar qux baz qux');
  });

  it('should fail for missing file', async () => {
    const result = await tool.execute(
      { path: 'nonexistent.ts', old_string: 'a', new_string: 'b' },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should fail for invalid params', async () => {
    const r1 = await tool.execute({ old_string: 'a', new_string: 'b' }, context);
    expect(r1.success).toBe(false);

    const r2 = await tool.execute({ path: 'f.ts', new_string: 'b' }, context);
    expect(r2.success).toBe(false);

    const r3 = await tool.execute({ path: 'f.ts', old_string: 'a' }, context);
    expect(r3.success).toBe(false);
  });

  it('should require permission', () => {
    expect(tool.requiresPermission).toBe(true);
  });
});
