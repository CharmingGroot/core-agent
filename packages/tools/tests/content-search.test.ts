import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ContentSearchTool } from '../src/content-search.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-content-search');

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 50,
  workingDirectory: TEST_DIR,
};

describe('ContentSearchTool', () => {
  let tool: ContentSearchTool;
  let context: RunContext;

  beforeEach(async () => {
    tool = new ContentSearchTool();
    context = new RunContext(TEST_CONFIG);
    await mkdir(join(TEST_DIR, 'src'), { recursive: true });
    await writeFile(join(TEST_DIR, 'src', 'foo.ts'), 'const hello = "world";\nfunction greet() {}\n', 'utf-8');
    await writeFile(join(TEST_DIR, 'src', 'bar.ts'), 'import { hello } from "./foo";\nconsole.log(hello);\n', 'utf-8');
    await writeFile(join(TEST_DIR, 'readme.md'), '# Test Project\nNo code here.', 'utf-8');
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should describe itself', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('content_search');
    expect(desc.parameters.length).toBe(5);
  });

  it('should find matches across files', async () => {
    const result = await tool.execute({ pattern: 'hello' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('hello');
    expect(result.metadata?.matchCount).toBeGreaterThanOrEqual(2);
  });

  it('should filter by glob', async () => {
    const result = await tool.execute({ pattern: 'hello', glob: '**/*.md' }, context);
    expect(result.success).toBe(true);
    expect(result.metadata?.matchCount).toBe(0);
  });

  it('should support regex patterns', async () => {
    const result = await tool.execute({ pattern: 'function\\s+\\w+' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('greet');
  });

  it('should support case-insensitive search', async () => {
    const result = await tool.execute({ pattern: 'HELLO', case_insensitive: true }, context);
    expect(result.success).toBe(true);
    expect(result.metadata?.matchCount).toBeGreaterThanOrEqual(2);
  });

  it('should respect max_results', async () => {
    const result = await tool.execute({ pattern: 'hello', max_results: 1 }, context);
    expect(result.success).toBe(true);
    expect(result.metadata?.matchCount).toBe(1);
  });

  it('should return no matches for non-existent pattern', async () => {
    const result = await tool.execute({ pattern: 'zzz_nonexistent_zzz' }, context);
    expect(result.success).toBe(true);
    expect(result.metadata?.matchCount).toBe(0);
  });

  it('should fail on invalid regex', async () => {
    const result = await tool.execute({ pattern: '[invalid' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid regex');
  });

  it('should fail for missing pattern param', async () => {
    const result = await tool.execute({}, context);
    expect(result.success).toBe(false);
  });

  it('should not require permission', () => {
    expect(tool.requiresPermission).toBe(false);
  });
});
