import { describe, it, expect } from 'vitest';
import { OpenPolicy } from '../src/open-policy.js';

describe('OpenPolicy', () => {
  const policy = new OpenPolicy();

  it('should allow all skills', async () => {
    expect(await policy.canUseSkill('any-user', 'any-skill')).toBe(true);
  });

  it('should allow all tools', async () => {
    expect(await policy.canUseTool('any-user', 'shell_exec')).toBe(true);
  });

  it('should never require approval', async () => {
    expect(await policy.requiresApproval('any-user', 'shell_exec')).toBe(false);
  });

  it('should auto-approve all requests', async () => {
    const result = await policy.requestApproval({
      userId: 'user-1',
      action: 'tool_call',
      toolName: 'shell_exec',
      params: { command: 'ls' },
    });
    expect(result.status).toBe('approved');
  });

  it('should return wildcard for allowed skills', async () => {
    const skills = await policy.getAllowedSkills('any-user');
    expect(skills).toContain('*');
  });

  it('should return wildcard for allowed tools', async () => {
    const tools = await policy.getAllowedTools('any-user');
    expect(tools).toContain('*');
  });

  it('should not throw on recordAction', async () => {
    await expect(
      policy.recordAction({
        timestamp: new Date(),
        runId: 'run-1',
        agentId: 'agent-1',
        userId: 'user-1',
        action: 'tool_call',
        decision: 'allowed',
      })
    ).resolves.toBeUndefined();
  });
});
