import { describe, it, expect, beforeEach } from 'vitest';
import { ReflectTool } from '../src/reflect.js';
import type { SkillProvider, SkillGuidelines } from '../src/reflect.js';
import { RunContext } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';

const TEST_CONFIG: AgentConfig = {
  provider: {
    providerId: 'test',
    model: 'test',
    auth: { type: 'api-key' as const, apiKey: 'test' },
    maxTokens: 4096,
    temperature: 0.7,
  },
  maxIterations: 50,
  workingDirectory: '/tmp/reflect-test',
};

describe('ReflectTool', () => {
  let tool: ReflectTool;
  let context: RunContext;

  beforeEach(() => {
    tool = new ReflectTool();
    context = new RunContext(TEST_CONFIG);
  });

  it('should return skill guidelines for file-read', async () => {
    const result = await tool.execute({ skillName: 'file-read' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('file-read');
    expect(result.output).toContain('Read files to understand content');
  });

  it('should return skill guidelines for file-write', async () => {
    const result = await tool.execute({ skillName: 'file-write' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('file-write');
    expect(result.output).toContain('Write or modify files carefully');
  });

  it('should return skill guidelines for shell-exec', async () => {
    const result = await tool.execute({ skillName: 'shell-exec' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('shell-exec');
    expect(result.output).toContain('Execute shell commands with caution');
  });

  it('should return skill guidelines for code-edit', async () => {
    const result = await tool.execute({ skillName: 'code-edit' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('code-edit');
    expect(result.output).toContain('read-verify-write cycle');
  });

  it('should return skill guidelines for code-review', async () => {
    const result = await tool.execute({ skillName: 'code-review' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('code-review');
    expect(result.output).toContain('Analyze code for quality');
  });

  it('should return failure for unknown skill name', async () => {
    const result = await tool.execute({ skillName: 'nonexistent-skill' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No guidelines found for skill "nonexistent-skill"');
  });

  it('should return failure for empty skill name', async () => {
    const result = await tool.execute({ skillName: '' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Parameter "skillName" is required');
  });

  it('should include checklist items in output', async () => {
    const result = await tool.execute({ skillName: 'file-read' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('## Checklist');
    expect(result.output).toContain('- [ ] Use relative paths from working directory');
    expect(result.output).toContain('- [ ] Do not attempt to read binary files');
  });

  it('should include reflection instructions in output', async () => {
    const result = await tool.execute({ skillName: 'file-read' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('## Instructions');
    expect(result.output).toContain('Review each checklist item against your recent actions');
    expect(result.output).toContain('take corrective action immediately');
    expect(result.output).toContain('confirm compliance');
  });

  it('should list available skills when skill not found', async () => {
    const result = await tool.execute({ skillName: 'unknown' }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Available skills:');
    expect(result.error).toContain('file-read');
    expect(result.error).toContain('shell-exec');
    expect(result.error).toContain('code-edit');
  });

  it('should accept custom SkillProvider', async () => {
    const customProvider: SkillProvider = {
      getSkillGuidelines(skillName: string): SkillGuidelines | undefined {
        if (skillName === 'custom-skill') {
          return {
            prompt: 'Custom skill prompt',
            rules: ['Custom rule one', 'Custom rule two'],
            tools: ['custom_tool'],
          };
        }
        return undefined;
      },
      getAvailableSkills(): string[] {
        return ['custom-skill'];
      },
    };

    const customTool = new ReflectTool(customProvider);
    const result = await customTool.execute({ skillName: 'custom-skill' }, context);
    expect(result.success).toBe(true);
    expect(result.output).toContain('Custom skill prompt');
    expect(result.output).toContain('- [ ] Custom rule one');
    expect(result.output).toContain('custom_tool');
  });

  it('should be case-insensitive for skill names', async () => {
    const result1 = await tool.execute({ skillName: 'FILE-READ' }, context);
    const result2 = await tool.execute({ skillName: 'File-Read' }, context);
    const result3 = await tool.execute({ skillName: 'file-read' }, context);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    expect(result3.success).toBe(true);
    expect(result1.output).toContain('Read files to understand content');
    expect(result2.output).toContain('Read files to understand content');
  });

  it('should have correct name and no permission required', () => {
    expect(tool.name).toBe('reflect');
    expect(tool.requiresPermission).toBe(false);
  });

  it('should describe itself correctly', () => {
    const desc = tool.describe();
    expect(desc.name).toBe('reflect');
    expect(desc.parameters.length).toBe(1);
    expect(desc.parameters[0].name).toBe('skillName');
    expect(desc.parameters[0].required).toBe(true);
  });
});
