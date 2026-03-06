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

  it('should set sequential dependsOn for matched tasks', () => {
    const plan = planner.decompose(
      'review code and deploy to production',
      agents,
    );

    // 첫 번째 태스크는 의존성 없음
    expect(plan.tasks[0].dependsOn).toEqual([]);

    // 두 번째 태스크는 첫 번째에 의존
    if (plan.tasks.length > 1) {
      expect(plan.tasks[1].dependsOn).toContain(plan.tasks[0].taskId);
    }
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
});
