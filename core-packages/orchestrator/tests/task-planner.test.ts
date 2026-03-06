import { describe, it, expect } from 'vitest';
import { TaskPlanner } from '../src/task-planner.js';
import type { SubAgentDescriptor } from '@core/types';

function createAgent(
  id: string,
  description: string,
  skillName: string,
): SubAgentDescriptor {
  return {
    id,
    description,
    skillName,
    parameters: [
      { name: 'input', type: 'string', description: 'input data', required: true },
    ],
  };
}

describe('TaskPlanner', () => {
  const planner = new TaskPlanner();

  const codeReviewAgent = createAgent(
    'agent_code_review',
    'Review code for bugs and style issues',
    'code-review',
  );

  const deployAgent = createAgent(
    'agent_deploy',
    'Deploy application to production environment',
    'deploy',
  );

  const testAgent = createAgent(
    'agent_test',
    'Run automated tests and generate coverage report',
    'testing',
  );

  const agents = [codeReviewAgent, deployAgent, testAgent];

  it('should decompose goal matching single agent by keyword', () => {
    const plan = planner.decompose('review my code', agents);

    expect(plan.originalGoal).toBe('review my code');
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0].agentId).toBe('agent_code_review');
    expect(plan.tasks[0].status).toBe('pending');
    expect(plan.goalId).toBeTruthy();
  });

  it('should decompose goal matching multiple agents', () => {
    const plan = planner.decompose(
      'review code and deploy to production',
      agents,
    );

    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);
    const agentIds = plan.tasks.map((t) => t.agentId);
    expect(agentIds).toContain('agent_code_review');
    expect(agentIds).toContain('agent_deploy');
  });

  it('should fallback to first agent when no keyword matches', () => {
    const plan = planner.decompose('do something completely unrelated xyz', agents);

    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0].agentId).toBe('agent_code_review');
    expect(plan.tasks[0].description).toContain('fallback');
  });

  it('should return empty plan when no agents are available', () => {
    const plan = planner.decompose('review code', []);

    expect(plan.tasks.length).toBe(0);
    expect(plan.originalGoal).toBe('review code');
  });

  it('should set tier-based dependsOn for matched tasks (same score = independent)', () => {
    // Use agents specifically designed to have the same match score
    const agentA = createAgent('agent_a', 'analyze data patterns', 'analyze');
    const agentB = createAgent('agent_b', 'visualize data charts', 'visualize');

    // "data" matches both agents with score 1 -> same tier -> no deps
    const plan = planner.decompose('process data', [agentA, agentB]);

    expect(plan.tasks.length).toBe(2);
    // Same-score tasks have no dependencies on each other
    expect(plan.tasks[0].dependsOn).toEqual([]);
    expect(plan.tasks[1].dependsOn).toEqual([]);
  });

  it('should make lower-score tasks depend on higher-score tasks', () => {
    // Create agents where one will have higher score than others
    const highMatchAgent = createAgent(
      'agent_high',
      'code review analysis code',
      'code-analysis',
    );
    const lowMatchAgent = createAgent(
      'agent_low',
      'deploy code to server',
      'deploy',
    );

    // Goal: "code review" -> highMatchAgent matches "code" + "review" (score 2),
    // lowMatchAgent matches "code" (score 1)
    const plan = planner.decompose('code review', [highMatchAgent, lowMatchAgent]);

    expect(plan.tasks.length).toBe(2);
    // High-score task has no deps
    const highTask = plan.tasks.find((t) => t.agentId === 'agent_high')!;
    expect(highTask.dependsOn).toEqual([]);

    // Low-score task depends on high-score task
    const lowTask = plan.tasks.find((t) => t.agentId === 'agent_low')!;
    expect(lowTask.dependsOn).toContain(highTask.taskId);
  });

  it('should generate unique taskId and goalId', () => {
    const plan1 = planner.decompose('review code', agents);
    const plan2 = planner.decompose('review code', agents);

    expect(plan1.goalId).not.toBe(plan2.goalId);
    expect(plan1.tasks[0].taskId).not.toBe(plan2.tasks[0].taskId);
  });

  it('should set createdAt timestamp', () => {
    const before = new Date();
    const plan = planner.decompose('review code', agents);
    const after = new Date();

    expect(plan.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(plan.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should match agent by skillName keywords', () => {
    const plan = planner.decompose('run testing suite', agents);

    expect(plan.tasks.length).toBeGreaterThanOrEqual(1);
    expect(plan.tasks[0].agentId).toBe('agent_test');
  });

  it('should make same-score matches independent (no deps)', () => {
    // Two agents that both match the goal with the same score
    const agentA = createAgent('agent_a', 'analyze data patterns', 'analyze');
    const agentB = createAgent('agent_b', 'visualize data charts', 'visualize');

    // Goal "data" matches both with score 1
    const plan = planner.decompose('process data', [agentA, agentB]);

    expect(plan.tasks.length).toBe(2);
    // Both tasks should have no dependencies (same score = parallel)
    for (const task of plan.tasks) {
      expect(task.dependsOn).toEqual([]);
    }
  });

  it('decomposeParallel should produce tasks with no dependencies', () => {
    const plan = planner.decomposeParallel('do everything', agents);

    expect(plan.tasks.length).toBe(agents.length);
    expect(plan.originalGoal).toBe('do everything');
    expect(plan.goalId).toBeTruthy();

    // All tasks should have empty dependsOn
    for (const task of plan.tasks) {
      expect(task.dependsOn).toEqual([]);
    }

    // Each agent should have a corresponding task
    const agentIds = plan.tasks.map((t) => t.agentId);
    expect(agentIds).toContain('agent_code_review');
    expect(agentIds).toContain('agent_deploy');
    expect(agentIds).toContain('agent_test');
  });

  it('decomposeParallel should return empty plan for no agents', () => {
    const plan = planner.decomposeParallel('do everything', []);

    expect(plan.tasks.length).toBe(0);
    expect(plan.originalGoal).toBe('do everything');
  });
});
