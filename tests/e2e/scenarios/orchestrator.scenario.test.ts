/**
 * Scenario tests for @core/orchestrator package.
 * Covers SubAgentRegistry, TaskPlanner, MockSubAgentExecutor, Orchestrator,
 * dependency ordering, and full end-to-end integration.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import type {
  SubAgentDescriptor,
  SubAgentResult,
  IPolicyProvider,
  PlannedTask,
} from '@core/types';

import type {
  ISubAgentExecutor,
  ExecutionContext,
  OrchestratorResult,
} from '@core/orchestrator';

// ---------------------------------------------------------------------------
// Shared Fixtures
// ---------------------------------------------------------------------------

function createResearchAgent(): SubAgentDescriptor {
  return {
    id: 'researcher',
    description: 'Research and gather information on topics',
    skillName: 'research',
    parameters: [
      { name: 'topic', type: 'string', description: 'Research topic', required: true },
    ],
  };
}

function createWriterAgent(): SubAgentDescriptor {
  return {
    id: 'writer',
    description: 'Write reports and documents based on provided information',
    skillName: 'write',
    parameters: [
      { name: 'content', type: 'string', description: 'Content to write about', required: true },
      { name: 'format', type: 'string', description: 'Output format', required: false },
    ],
  };
}

function createCodeReviewAgent(): SubAgentDescriptor {
  return {
    id: 'code-reviewer',
    description: 'Review code for quality and best practices',
    skillName: 'code_review',
    parameters: [
      { name: 'repository', type: 'string', description: 'Repository URL', required: true },
    ],
  };
}

function makeSuccessResult(agentId: string, skillName: string, summary: string): SubAgentResult {
  return {
    agentId,
    skillName,
    success: true,
    summary,
    tokenUsage: { input: 200, output: 100 },
    durationMs: 75,
  };
}

/**
 * DenyPolicy - denies all skill access for testing policy rejection.
 */
class DenyPolicy implements IPolicyProvider {
  async canUseSkill(): Promise<boolean> {
    return false;
  }
  async canUseTool(): Promise<boolean> {
    return false;
  }
  async requiresApproval(): Promise<boolean> {
    return false;
  }
  async requestApproval(): Promise<{ status: 'denied'; reason: string; timestamp: Date }> {
    return { status: 'denied', reason: 'denied by policy', timestamp: new Date() };
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
  async getProfile(): Promise<null> {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. SubAgentRegistry - Management
// ---------------------------------------------------------------------------
describe('SubAgentRegistry - Management', () => {
  let SubAgentRegistry: Awaited<typeof import('@core/orchestrator')>['SubAgentRegistry'];

  beforeEach(async () => {
    const mod = await import('@core/orchestrator');
    SubAgentRegistry = mod.SubAgentRegistry;
  });

  it('should register an agent descriptor and retrieve it via get()', () => {
    const registry = new SubAgentRegistry();
    const agent = createResearchAgent();

    registry.register(agent);

    const retrieved = registry.get('researcher');
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe('researcher');
    expect(retrieved!.description).toBe(agent.description);
    expect(retrieved!.skillName).toBe('research');
    expect(retrieved!.parameters).toHaveLength(1);
    expect(retrieved!.parameters[0].name).toBe('topic');
  });

  it('should register multiple agents, getAll returns all, size is correct', () => {
    const registry = new SubAgentRegistry();

    registry.register(createResearchAgent());
    registry.register(createWriterAgent());
    registry.register(createCodeReviewAgent());

    expect(registry.size).toBe(3);

    const all = registry.getAll();
    expect(all).toHaveLength(3);

    const ids = all.map((a) => a.id);
    expect(ids).toContain('researcher');
    expect(ids).toContain('writer');
    expect(ids).toContain('code-reviewer');
  });

  it('should unregister an agent so get returns undefined', () => {
    const registry = new SubAgentRegistry();
    registry.register(createResearchAgent());
    registry.register(createWriterAgent());

    expect(registry.size).toBe(2);

    const removed = registry.unregister('researcher');
    expect(removed).toBe(true);
    expect(registry.get('researcher')).toBeUndefined();
    expect(registry.size).toBe(1);

    // Unregistering a non-existent agent returns false
    const removedAgain = registry.unregister('researcher');
    expect(removedAgain).toBe(false);
  });

  it('should convert agents to ToolDescriptionRef[] via toToolDescriptions()', () => {
    const registry = new SubAgentRegistry();
    registry.register(createResearchAgent());
    registry.register(createWriterAgent());

    const toolDescs = registry.toToolDescriptions();
    expect(toolDescs).toHaveLength(2);

    const researchTool = toolDescs.find((t) => t.name === 'researcher');
    expect(researchTool).toBeDefined();
    expect(researchTool!.description).toBe('Research and gather information on topics');
    expect(researchTool!.parameters).toHaveLength(1);
    expect(researchTool!.parameters[0]).toMatchObject({
      name: 'topic',
      type: 'string',
      required: true,
    });
    expect(researchTool!.tokenEstimate).toBeGreaterThan(0);

    const writerTool = toolDescs.find((t) => t.name === 'writer');
    expect(writerTool).toBeDefined();
    expect(writerTool!.parameters).toHaveLength(2);
    // Writer has more params so higher token estimate
    expect(writerTool!.tokenEstimate).toBeGreaterThan(researchTool!.tokenEstimate);
  });
});

// ---------------------------------------------------------------------------
// 2. TaskPlanner - Goal Decomposition
// ---------------------------------------------------------------------------
describe('TaskPlanner - Goal Decomposition', () => {
  let TaskPlanner: Awaited<typeof import('@core/orchestrator')>['TaskPlanner'];

  beforeEach(async () => {
    const mod = await import('@core/orchestrator');
    TaskPlanner = mod.TaskPlanner;
  });

  it('should create 1 task when single agent is available', () => {
    const planner = new TaskPlanner();
    const agents = [createResearchAgent()];

    const plan = planner.decompose('research quantum computing', agents);

    expect(plan.originalGoal).toBe('research quantum computing');
    expect(plan.goalId).toBeTruthy();
    expect(plan.createdAt).toBeInstanceOf(Date);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].agentId).toBe('researcher');
    expect(plan.tasks[0].skillName).toBe('research');
    expect(plan.tasks[0].status).toBe('pending');
  });

  it('should match keywords in goal to agent descriptions for multiple agents', () => {
    const planner = new TaskPlanner();
    const agents = [createResearchAgent(), createWriterAgent(), createCodeReviewAgent()];

    // "research" matches researcher, "write" matches writer
    const plan = planner.decompose('research the topic and write a report', agents);

    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);

    const agentIds = plan.tasks.map((t) => t.agentId);
    expect(agentIds).toContain('researcher');
    expect(agentIds).toContain('writer');
  });

  it('should fall back to first agent when no keywords match', () => {
    const planner = new TaskPlanner();
    const agents = [createResearchAgent(), createWriterAgent()];

    // "xyzzy" matches nothing in any agent description
    const plan = planner.decompose('xyzzy foobar bazzle', agents);

    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0].agentId).toBe('researcher');
    expect(plan.tasks[0].description).toContain('fallback');
  });

  it('should produce tasks with correct structure', () => {
    const planner = new TaskPlanner();
    const agents = [createResearchAgent()];

    const plan = planner.decompose('research something interesting', agents);
    const task = plan.tasks[0];

    expect(task.taskId).toBeTruthy();
    expect(typeof task.taskId).toBe('string');
    expect(task.agentId).toBe('researcher');
    expect(task.skillName).toBe('research');
    expect(task.status).toBe('pending');
    expect(task.params).toBeDefined();
    expect(Array.isArray(task.dependsOn)).toBe(true);
  });

  it('should set dependencies correctly for sequential tasks by score tiers', () => {
    const planner = new TaskPlanner();
    // Craft agents and goal so that both match but with different scores
    const agents = [createResearchAgent(), createWriterAgent()];

    // "research" strongly matches researcher; "write reports" matches writer
    const plan = planner.decompose('research information and write reports', agents);

    if (plan.tasks.length >= 2) {
      // Higher-scoring task comes first with no dependencies
      const firstTask = plan.tasks[0];
      expect(firstTask.dependsOn).toHaveLength(0);

      // Lower-scoring tasks depend on higher-scoring ones
      const laterTasks = plan.tasks.slice(1);
      for (const task of laterTasks) {
        // Each later task either has no deps (same tier) or depends on earlier tasks
        if (task.dependsOn.length > 0) {
          for (const depId of task.dependsOn) {
            // Dependency should reference an earlier task
            const depTask = plan.tasks.find((t) => t.taskId === depId);
            expect(depTask).toBeDefined();
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. MockSubAgentExecutor - Test Helper
// ---------------------------------------------------------------------------
describe('MockSubAgentExecutor - Test Helper', () => {
  let MockSubAgentExecutor: Awaited<typeof import('@core/orchestrator')>['MockSubAgentExecutor'];
  let OpenPolicy: Awaited<typeof import('@core/types')>['OpenPolicy'];

  beforeEach(async () => {
    const mod = await import('@core/orchestrator');
    MockSubAgentExecutor = mod.MockSubAgentExecutor;
    const types = await import('@core/types');
    OpenPolicy = types.OpenPolicy;
  });

  function createTask(taskId: string, agentId: string, skillName: string): PlannedTask {
    return {
      taskId,
      description: `Test task for ${agentId}`,
      agentId,
      skillName,
      params: {},
      dependsOn: [],
      status: 'pending',
    };
  }

  function createContext(): ExecutionContext {
    return {
      userId: 'test-user',
      policy: new OpenPolicy(),
    };
  }

  it('should return preset result via setResult(taskId, result)', async () => {
    const executor = new MockSubAgentExecutor();
    const task = createTask('task-1', 'researcher', 'research');
    const customResult = makeSuccessResult('researcher', 'research', 'Custom research result');

    executor.setResult('task-1', customResult);

    const result = await executor.execute(task, createContext());
    expect(result).toBe(customResult);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('Custom research result');
  });

  it('should return failure for agents marked via setAgentFailure(agentId)', async () => {
    const executor = new MockSubAgentExecutor();
    const task = createTask('task-2', 'writer', 'write');

    executor.setAgentFailure('writer');

    const result = await executor.execute(task, createContext());
    expect(result.success).toBe(false);
    expect(result.agentId).toBe('writer');
    expect(result.error).toBeDefined();
    expect(result.error).toContain('writer');
  });

  it('should track all executed tasks in executedTasks', async () => {
    const executor = new MockSubAgentExecutor();
    const task1 = createTask('task-a', 'researcher', 'research');
    const task2 = createTask('task-b', 'writer', 'write');
    const ctx = createContext();

    await executor.execute(task1, ctx);
    await executor.execute(task2, ctx);

    expect(executor.executedTasks).toHaveLength(2);
    expect(executor.executedTasks[0].taskId).toBe('task-a');
    expect(executor.executedTasks[1].taskId).toBe('task-b');
  });

  it('should return a default success result when no preset is configured', async () => {
    const executor = new MockSubAgentExecutor();
    const task = createTask('task-default', 'researcher', 'research');

    const result = await executor.execute(task, createContext());

    expect(result.success).toBe(true);
    expect(result.agentId).toBe('researcher');
    expect(result.skillName).toBe('research');
    expect(result.summary).toBeTruthy();
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage.input).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Orchestrator - Full Pipeline
// ---------------------------------------------------------------------------
describe('Orchestrator - Full Pipeline', () => {
  let SubAgentRegistry: Awaited<typeof import('@core/orchestrator')>['SubAgentRegistry'];
  let MockSubAgentExecutor: Awaited<typeof import('@core/orchestrator')>['MockSubAgentExecutor'];
  let Orchestrator: Awaited<typeof import('@core/orchestrator')>['Orchestrator'];
  let OpenPolicy: Awaited<typeof import('@core/types')>['OpenPolicy'];

  beforeEach(async () => {
    const mod = await import('@core/orchestrator');
    SubAgentRegistry = mod.SubAgentRegistry;
    MockSubAgentExecutor = mod.MockSubAgentExecutor;
    Orchestrator = mod.Orchestrator;
    const types = await import('@core/types');
    OpenPolicy = types.OpenPolicy;
  });

  function setupOrchestrator(
    agents: SubAgentDescriptor[],
    executor: InstanceType<typeof MockSubAgentExecutor>,
    policy?: IPolicyProvider,
  ) {
    const registry = new SubAgentRegistry();
    for (const agent of agents) {
      registry.register(agent);
    }
    return new Orchestrator({
      agentRegistry: registry,
      executor,
      policy: policy ?? new OpenPolicy(),
    });
  }

  it('should succeed with a goal matching one agent and execute 1 task', async () => {
    const executor = new MockSubAgentExecutor();
    const orchestrator = setupOrchestrator(
      [createResearchAgent(), createWriterAgent()],
      executor,
    );

    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'research quantum computing advances',
    });

    expect(result.success).toBe(true);
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.content).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // At least the researcher should have been executed
    const executedAgentIds = executor.executedTasks.map((t) => t.agentId);
    expect(executedAgentIds).toContain('researcher');
  });

  it('should handle a complex goal matching multiple agents', async () => {
    const executor = new MockSubAgentExecutor();
    const orchestrator = setupOrchestrator(
      [createResearchAgent(), createWriterAgent(), createCodeReviewAgent()],
      executor,
    );

    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'research the topic then write a detailed report',
    });

    expect(result.success).toBe(true);
    expect(result.tasks.length).toBeGreaterThanOrEqual(2);
    expect(result.results.length).toBeGreaterThanOrEqual(2);

    const executedAgentIds = executor.executedTasks.map((t) => t.agentId);
    expect(executedAgentIds).toContain('researcher');
    expect(executedAgentIds).toContain('writer');
  });

  it('should aggregate totalTokens from all task results', async () => {
    const executor = new MockSubAgentExecutor();
    const orchestrator = setupOrchestrator(
      [createResearchAgent(), createWriterAgent()],
      executor,
    );

    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'research information and write documents',
    });

    expect(result.success).toBe(true);
    expect(result.totalTokens.input).toBeGreaterThan(0);
    expect(result.totalTokens.output).toBeGreaterThan(0);

    // totalTokens should be sum of all individual results
    const expectedInput = result.results.reduce((sum, r) => sum + r.tokenUsage.input, 0);
    const expectedOutput = result.results.reduce((sum, r) => sum + r.tokenUsage.output, 0);
    expect(result.totalTokens.input).toBe(expectedInput);
    expect(result.totalTokens.output).toBe(expectedOutput);
  });

  it('should reflect failure when one task fails', async () => {
    const executor = new MockSubAgentExecutor();
    executor.setAgentFailure('writer');

    const orchestrator = setupOrchestrator(
      [createResearchAgent(), createWriterAgent()],
      executor,
    );

    // Goal that matches writer (which will fail)
    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'write a comprehensive document',
    });

    expect(result.success).toBe(false);
    expect(result.content).toContain('Error');

    const failedResults = result.results.filter((r) => !r.success);
    expect(failedResults.length).toBeGreaterThanOrEqual(1);
  });

  it('should return error when policy denies access', async () => {
    const executor = new MockSubAgentExecutor();
    const denyPolicy = new DenyPolicy();

    const orchestrator = setupOrchestrator(
      [createResearchAgent()],
      executor,
      denyPolicy,
    );

    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'research something',
    });

    expect(result.success).toBe(false);
    expect(result.content).toBeTruthy();
    // No tasks should have been executed
    expect(executor.executedTasks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Orchestrator - Dependency Order
// ---------------------------------------------------------------------------
describe('Orchestrator - Dependency Order', () => {
  let SubAgentRegistry: Awaited<typeof import('@core/orchestrator')>['SubAgentRegistry'];
  let MockSubAgentExecutor: Awaited<typeof import('@core/orchestrator')>['MockSubAgentExecutor'];
  let Orchestrator: Awaited<typeof import('@core/orchestrator')>['Orchestrator'];
  let TaskPlanner: Awaited<typeof import('@core/orchestrator')>['TaskPlanner'];
  let OpenPolicy: Awaited<typeof import('@core/types')>['OpenPolicy'];

  beforeEach(async () => {
    const mod = await import('@core/orchestrator');
    SubAgentRegistry = mod.SubAgentRegistry;
    MockSubAgentExecutor = mod.MockSubAgentExecutor;
    Orchestrator = mod.Orchestrator;
    TaskPlanner = mod.TaskPlanner;
    const types = await import('@core/types');
    OpenPolicy = types.OpenPolicy;
  });

  it('should create tasks with a dependency chain for "research and then write"', () => {
    const planner = new TaskPlanner();
    const agents = [createResearchAgent(), createWriterAgent()];

    // Both "research" and "write" should match their respective agents
    const plan = planner.decompose('research and then write a report', agents);

    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);

    const researchTask = plan.tasks.find((t) => t.agentId === 'researcher');
    const writeTask = plan.tasks.find((t) => t.agentId === 'writer');

    expect(researchTask).toBeDefined();
    expect(writeTask).toBeDefined();

    // If scores differ, the lower-scoring task should depend on the higher-scoring one.
    // If scores are equal, both run in parallel (no dependencies).
    // Either way the structure is valid.
    if (writeTask!.dependsOn.length > 0) {
      expect(writeTask!.dependsOn).toContain(researchTask!.taskId);
    }
  });

  it('should execute tasks respecting dependency order', async () => {
    const executor = new MockSubAgentExecutor();
    const registry = new SubAgentRegistry();
    registry.register(createResearchAgent());
    registry.register(createWriterAgent());

    const orchestrator = new Orchestrator({
      agentRegistry: registry,
      executor,
      policy: new OpenPolicy(),
    });

    const result = await orchestrator.run({
      userId: 'user-1',
      goal: 'research information and write reports about documents',
    });

    expect(result.success).toBe(true);

    // Verify both agents were executed
    const executedAgentIds = executor.executedTasks.map((t) => t.agentId);
    expect(executedAgentIds).toContain('researcher');
    expect(executedAgentIds).toContain('writer');

    // If tasks had dependencies, the depended-upon task must appear first in execution
    const researchIndex = executor.executedTasks.findIndex((t) => t.agentId === 'researcher');
    const writerIndex = executor.executedTasks.findIndex((t) => t.agentId === 'writer');

    // Find the writer task in the plan to check if it depends on researcher
    const writerTask = result.tasks.find((t) => t.agentId === 'writer');
    const researchTask = result.tasks.find((t) => t.agentId === 'researcher');
    if (writerTask && researchTask && writerTask.dependsOn.includes(researchTask.taskId)) {
      expect(researchIndex).toBeLessThan(writerIndex);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. End-to-End: Registry -> Planner -> Executor -> Orchestrator
// ---------------------------------------------------------------------------
describe('End-to-End: Registry -> Planner -> Executor -> Orchestrator', () => {
  it('should complete a full orchestration pipeline from registration to result', async () => {
    const { SubAgentRegistry, MockSubAgentExecutor, TaskPlanner, Orchestrator } =
      await import('@core/orchestrator');
    const { OpenPolicy } = await import('@core/types');

    // 1. Create registry and register agents with descriptors
    const registry = new SubAgentRegistry();
    const researchAgent = createResearchAgent();
    const writerAgent = createWriterAgent();
    const codeReviewAgent = createCodeReviewAgent();

    registry.register(researchAgent);
    registry.register(writerAgent);
    registry.register(codeReviewAgent);

    expect(registry.size).toBe(3);

    // 2. Verify tool descriptions are generated
    const toolDescs = registry.toToolDescriptions();
    expect(toolDescs).toHaveLength(3);

    // 3. Create planner independently and verify decomposition works
    const planner = new TaskPlanner();
    const agents = registry.getAll();
    const plan = planner.decompose('research the codebase and review code quality', agents);

    expect(plan.tasks.length).toBeGreaterThanOrEqual(1);
    expect(plan.originalGoal).toBe('research the codebase and review code quality');

    // 4. Create mock executor (default behavior returns success for all tasks)
    const executor = new MockSubAgentExecutor();

    // 5. Create orchestrator with all dependencies
    // Note: Orchestrator creates its own internal TaskPlanner, so task IDs
    // will differ from the standalone planner above. We rely on the default
    // mock success behavior rather than preset results by taskId.
    const orchestrator = new Orchestrator({
      agentRegistry: registry,
      executor,
      policy: new OpenPolicy(),
    });

    // 6. Run the goal
    const result: OrchestratorResult = await orchestrator.run({
      userId: 'integration-user',
      domainId: 'test-domain',
      goal: 'research the codebase and review code quality',
    });

    // 7. Verify complete result chain
    expect(result.success).toBe(true);
    expect(result.content).toBeTruthy();
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.totalTokens.input).toBeGreaterThan(0);
    expect(result.totalTokens.output).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // All results should be successful (default mock returns success)
    for (const taskResult of result.results) {
      expect(taskResult.success).toBe(true);
      expect(taskResult.summary).toBeTruthy();
      expect(taskResult.agentId).toBeTruthy();
      expect(taskResult.skillName).toBeTruthy();
    }

    // All tasks should be completed
    for (const task of result.tasks) {
      expect(task.status).toBe('completed');
    }

    // Executor should have tracked all executions
    expect(executor.executedTasks.length).toBe(result.results.length);
  });
});
