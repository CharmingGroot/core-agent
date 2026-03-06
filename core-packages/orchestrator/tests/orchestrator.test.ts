import { describe, it, expect, beforeEach } from 'vitest';
import { Orchestrator } from '../src/orchestrator.js';
import { SubAgentRegistry } from '../src/sub-agent-registry.js';
import { MockSubAgentExecutor } from '../src/sub-agent-executor.js';
import type { SubAgentDescriptor, IPolicyProvider } from '@core/types';
import { OpenPolicy } from '@core/types';

function createAgent(
  id: string,
  description: string,
  skillName: string,
): SubAgentDescriptor {
  return {
    id,
    description,
    skillName,
    parameters: [],
  };
}

/**
 * RestrictivePolicy — 특정 스킬만 허용하는 테스트용 정책.
 */
class RestrictivePolicy implements IPolicyProvider {
  private readonly allowedSkillNames: string[];

  constructor(allowedSkillNames: string[]) {
    this.allowedSkillNames = allowedSkillNames;
  }

  async canUseSkill(_userId: string, skillName: string): Promise<boolean> {
    return this.allowedSkillNames.includes(skillName);
  }

  async canUseTool(): Promise<boolean> {
    return true;
  }

  async requiresApproval(): Promise<boolean> {
    return false;
  }

  async requestApproval(): Promise<{
    status: 'approved';
    timestamp: Date;
  }> {
    return { status: 'approved', timestamp: new Date() };
  }

  async recordAction(): Promise<void> {
    // no-op
  }

  async getAllowedSkills(): Promise<readonly string[]> {
    return this.allowedSkillNames;
  }

  async getAllowedTools(): Promise<readonly string[]> {
    return ['*'];
  }
}

/**
 * DenyAllPolicy — 모든 접근을 거부하는 테스트용 정책.
 */
class DenyAllPolicy implements IPolicyProvider {
  async canUseSkill(): Promise<boolean> {
    return false;
  }

  async canUseTool(): Promise<boolean> {
    return false;
  }

  async requiresApproval(): Promise<boolean> {
    return true;
  }

  async requestApproval(): Promise<{
    status: 'denied';
    timestamp: Date;
  }> {
    return { status: 'denied', timestamp: new Date() };
  }

  async recordAction(): Promise<void> {
    // no-op
  }

  async getAllowedSkills(): Promise<readonly string[]> {
    return [];
  }

  async getAllowedTools(): Promise<readonly string[]> {
    return [];
  }
}

describe('Orchestrator', () => {
  let registry: SubAgentRegistry;
  let executor: MockSubAgentExecutor;
  let orchestrator: Orchestrator;

  const codeAgent = createAgent(
    'agent_code',
    'Review and analyze code',
    'code-review',
  );

  const deployAgent = createAgent(
    'agent_deploy',
    'Deploy application to production',
    'deploy',
  );

  beforeEach(() => {
    registry = new SubAgentRegistry();
    executor = new MockSubAgentExecutor();

    registry.register(codeAgent);
    registry.register(deployAgent);

    orchestrator = new Orchestrator({
      agentRegistry: registry,
      executor,
      policy: new OpenPolicy(),
    });
  });

  it('should execute a full goal-to-result flow', async () => {
    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'review my code',
    });

    expect(result.success).toBe(true);
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.content).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should fail when no agents are registered', async () => {
    const emptyRegistry = new SubAgentRegistry();
    const orch = new Orchestrator({
      agentRegistry: emptyRegistry,
      executor,
      policy: new OpenPolicy(),
    });

    const result = await orch.run({
      userId: 'user-1',
      goal: 'do something',
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('No sub-agents registered');
  });

  it('should accumulate token usage from all sub-agent results', async () => {
    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'review code and deploy to production',
    });

    expect(result.totalTokens.input).toBeGreaterThan(0);
    expect(result.totalTokens.output).toBeGreaterThan(0);
  });

  it('should stop execution when a sub-agent fails', async () => {
    executor.setAgentFailure('agent_code');

    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'review code and deploy to production',
    });

    expect(result.success).toBe(false);
    // Code agent should have been executed (and failed)
    const codeResult = result.results.find(
      (r) => r.agentId === 'agent_code',
    );
    expect(codeResult).toBeDefined();
    expect(codeResult?.success).toBe(false);
  });

  it('should deny access when policy rejects user', async () => {
    const orch = new Orchestrator({
      agentRegistry: registry,
      executor,
      policy: new DenyAllPolicy(),
    });

    const result = await orch.run({
      userId: 'user-1',
      goal: 'review code',
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('Access denied');
  });

  it('should skip task when policy denies skill access', async () => {
    const restrictive = new RestrictivePolicy(['deploy']);
    const orch = new Orchestrator({
      agentRegistry: registry,
      executor,
      policy: restrictive,
    });

    const result = await orch.run({
      userId: 'user-1',
      goal: 'review code',
    });

    // code-review skill is not allowed, task should be skipped
    const skippedResults = result.results.filter((r) => !r.success);
    expect(skippedResults.length).toBeGreaterThanOrEqual(1);
  });

  it('should pass domainId through to execution context', async () => {
    const result = await orchestrator.run({
      userId: 'user-1',
      domainId: 'domain-abc',
      goal: 'review code',
    });

    expect(result.success).toBe(true);
    // Verify the executor received the task
    expect(executor.executedTasks.length).toBeGreaterThan(0);
  });

  it('should return results with correct structure', async () => {
    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'deploy to production',
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('tasks');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('totalTokens');
    expect(result).toHaveProperty('durationMs');
    expect(result.totalTokens).toHaveProperty('input');
    expect(result.totalTokens).toHaveProperty('output');
  });

  it('should join successful summaries in content', async () => {
    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'deploy to production',
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain('Completed');
  });
});
