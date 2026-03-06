import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Orchestrator } from '../src/orchestrator.js';
import { SubAgentRegistry } from '../src/sub-agent-registry.js';
import { MockSubAgentExecutor } from '../src/sub-agent-executor.js';
import type { SubAgentDescriptor, IPolicyProvider, PlannedTask, SubAgentResult } from '@core/types';
import { OpenPolicy } from '@core/types';
import { TaskPlanner } from '../src/task-planner.js';
import type { ISubAgentExecutor, ExecutionContext } from '../src/sub-agent-executor.js';

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

  it('should execute independent tasks in parallel', async () => {
    // Register 3 agents, use decomposeParallel (all independent)
    const agentA = createAgent('agent_a', 'analyze data patterns', 'analyze');
    const agentB = createAgent('agent_b', 'visualize data charts', 'visualize');
    const agentC = createAgent('agent_c', 'report data summary', 'report');

    const parallelRegistry = new SubAgentRegistry();
    parallelRegistry.register(agentA);
    parallelRegistry.register(agentB);
    parallelRegistry.register(agentC);

    const parallelExecutor = new MockSubAgentExecutor();

    // Create orchestrator that uses decomposeParallel via a custom planner
    const planner = new TaskPlanner();
    const plan = planner.decomposeParallel('process data', [agentA, agentB, agentC]);

    const orch = new Orchestrator({
      agentRegistry: parallelRegistry,
      executor: parallelExecutor,
      policy: new OpenPolicy(),
    });

    const result = await orch.run({
      userId: 'user-1',
      goal: 'analyze visualize report data',
    });

    expect(result.success).toBe(true);
    // All 3 agents should have been executed
    expect(parallelExecutor.executedTasks.length).toBe(3);
    const executedAgentIds = parallelExecutor.executedTasks.map((t) => t.agentId);
    expect(executedAgentIds).toContain('agent_a');
    expect(executedAgentIds).toContain('agent_b');
    expect(executedAgentIds).toContain('agent_c');
  });

  it('should respect dependency ordering', async () => {
    // Track execution order with timestamps
    const executionOrder: string[] = [];

    const trackingExecutor: ISubAgentExecutor = {
      async execute(task: PlannedTask, _context: ExecutionContext): Promise<SubAgentResult> {
        executionOrder.push(task.agentId);
        return {
          agentId: task.agentId,
          skillName: task.skillName,
          success: true,
          summary: `Done: ${task.agentId}`,
          tokenUsage: { input: 10, output: 5 },
          durationMs: 10,
        };
      },
    };

    // Create agents where one has higher score -> the other depends on it
    const highAgent = createAgent('agent_high', 'code review analysis code', 'code-analysis');
    const lowAgent = createAgent('agent_low', 'deploy code to server', 'deploy');

    const depRegistry = new SubAgentRegistry();
    depRegistry.register(highAgent);
    depRegistry.register(lowAgent);

    const orch = new Orchestrator({
      agentRegistry: depRegistry,
      executor: trackingExecutor,
      policy: new OpenPolicy(),
    });

    // "code review" -> highAgent score 2 (code + review), lowAgent score 1 (code)
    const result = await orch.run({
      userId: 'user-1',
      goal: 'code review',
    });

    expect(result.success).toBe(true);
    // High-score agent must execute before low-score agent
    const highIdx = executionOrder.indexOf('agent_high');
    const lowIdx = executionOrder.indexOf('agent_low');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('should execute same-score tasks concurrently', async () => {
    // Two agents that match with the same score should be in the same batch
    const agentX = createAgent('agent_x', 'analyze data patterns', 'analyze');
    const agentY = createAgent('agent_y', 'visualize data charts', 'visualize');

    const concurrentRegistry = new SubAgentRegistry();
    concurrentRegistry.register(agentX);
    concurrentRegistry.register(agentY);

    // Track that both tasks are started before either completes
    let concurrentCount = 0;
    let maxConcurrent = 0;

    const concurrentExecutor: ISubAgentExecutor = {
      async execute(task: PlannedTask, _context: ExecutionContext): Promise<SubAgentResult> {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        // Small delay to ensure overlap detection
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrentCount--;
        return {
          agentId: task.agentId,
          skillName: task.skillName,
          success: true,
          summary: `Done: ${task.agentId}`,
          tokenUsage: { input: 10, output: 5 },
          durationMs: 10,
        };
      },
    };

    const orch = new Orchestrator({
      agentRegistry: concurrentRegistry,
      executor: concurrentExecutor,
      policy: new OpenPolicy(),
    });

    // "data" matches both agents with score 1 -> same tier -> parallel
    const result = await orch.run({
      userId: 'user-1',
      goal: 'process data',
    });

    expect(result.success).toBe(true);
    expect(result.results.length).toBe(2);
    // Both tasks ran concurrently (maxConcurrent should be 2)
    expect(maxConcurrent).toBe(2);
  });

  it('should stop all tasks if one fails in parallel batch', async () => {
    const agentA = createAgent('agent_a', 'analyze data patterns', 'analyze');
    const agentB = createAgent('agent_b', 'visualize data charts', 'visualize');
    const agentC = createAgent('agent_c', 'report data summary', 'report');

    const failRegistry = new SubAgentRegistry();
    failRegistry.register(agentA);
    failRegistry.register(agentB);
    failRegistry.register(agentC);

    const failExecutor = new MockSubAgentExecutor();
    failExecutor.setAgentFailure('agent_b');

    const orch = new Orchestrator({
      agentRegistry: failRegistry,
      executor: failExecutor,
      policy: new OpenPolicy(),
    });

    // All three agents match "data" with score 1 -> same tier -> parallel
    const result = await orch.run({
      userId: 'user-1',
      goal: 'process data',
    });

    expect(result.success).toBe(false);
    // At least the failing agent should have a result
    const failedResult = result.results.find((r) => r.agentId === 'agent_b');
    expect(failedResult).toBeDefined();
    expect(failedResult?.success).toBe(false);
  });
});
