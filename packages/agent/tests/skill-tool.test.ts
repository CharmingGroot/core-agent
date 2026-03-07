import { describe, it, expect } from 'vitest';
import { SkillTool, type SkillEntry, type SkillProvider } from '../src/skill-tool.js';
import type { AgentConfig } from '@cli-agent/core';
import { RunContext } from '@cli-agent/core';

const TEST_CONFIG: AgentConfig = {
  provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: 'test' }, maxTokens: 4096, temperature: 0.7 },
  maxIterations: 10,
  workingDirectory: '/tmp',
};

function createRegistry(skills: SkillEntry[]): SkillProvider {
  return {
    get: (name: string) => skills.find((s) => s.name === name),
    getAll: () => skills,
  };
}

const SAMPLE_SKILLS: SkillEntry[] = [
  {
    name: 'code-review',
    description: 'Review code for quality and bugs',
    tools: ['file_read', 'content_search'],
    prompt: 'You are a code reviewer. Analyze code for bugs, style issues, and improvements.',
    rules: ['no-console-log'],
  },
  {
    name: 'deploy',
    description: 'Deploy application to production',
    tools: ['shell_exec', 'file_read'],
    prompt: 'You are a deployment specialist. Follow the deployment checklist carefully.',
    rules: ['require-approval', 'dry-run-first'],
  },
];

describe('SkillTool', () => {
  const context = new RunContext(TEST_CONFIG);

  it('should describe itself correctly', () => {
    const tool = new SkillTool(createRegistry([]));
    const desc = tool.describe();
    expect(desc.name).toBe('skill');
    expect(desc.parameters.length).toBeGreaterThanOrEqual(2);
  });

  it('should list available skills', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute({ action: 'list' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain('code-review');
    expect(result.output).toContain('deploy');
    expect(result.output).toContain('file_read');
  });

  it('should return empty message when no skills', async () => {
    const tool = new SkillTool(createRegistry([]));
    const result = await tool.execute({ action: 'list' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain('No skills available');
  });

  it('should invoke a skill by name', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute({ action: 'invoke', name: 'code-review' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain('code-review');
    expect(result.output).toContain('code reviewer');
    expect(result.output).toContain('file_read, content_search');
    expect(result.output).toContain('no-console-log');
    expect(result.metadata?.['skillName']).toBe('code-review');
  });

  it('should include user input in invocation', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute(
      { action: 'invoke', name: 'deploy', input: 'Deploy v2.1.0 to staging' },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Deploy v2.1.0 to staging');
    expect(result.output).toContain('deployment specialist');
  });

  it('should return error for unknown skill', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute({ action: 'invoke', name: 'nonexistent' }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error for missing name on invoke', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute({ action: 'invoke' }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing "name"');
  });

  it('should return error for unknown action', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute({ action: 'delete' }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
  });

  it('should return metadata with tools and rules on invoke', async () => {
    const tool = new SkillTool(createRegistry(SAMPLE_SKILLS));
    const result = await tool.execute({ action: 'invoke', name: 'deploy' }, context);

    expect(result.metadata?.['tools']).toEqual(['shell_exec', 'file_read']);
    expect(result.metadata?.['rules']).toEqual(['require-approval', 'dry-run-first']);
  });
});
