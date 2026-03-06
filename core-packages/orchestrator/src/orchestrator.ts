/**
 * Orchestrator — 메인 오케스트레이션 루프.
 *
 * 사용자 Goal을 받아 Sub-Agent들에게 위임하고 결과를 조립한다.
 *
 * 흐름:
 * 1. Policy check (사용자 권한)
 * 2. Available agents 조회
 * 3. Goal → TaskPlan 분해
 * 4. 병렬/순차 실행 (dependsOn 기반 토폴로지 실행)
 * 5. 결과 조립
 */
import type {
  PlannedTask,
  SubAgentResult,
  IPolicyProvider,
} from '@core/types';

import { SubAgentRegistry } from './sub-agent-registry.js';
import type { ISubAgentExecutor, ExecutionContext } from './sub-agent-executor.js';
import { TaskPlanner } from './task-planner.js';

/** Orchestrator 실행 요청 */
export interface OrchestratorRequest {
  readonly userId: string;
  readonly domainId?: string;
  readonly goal: string;
}

/** Orchestrator 실행 결과 */
export interface OrchestratorResult {
  readonly success: boolean;
  readonly content: string;
  readonly tasks: PlannedTask[];
  readonly results: SubAgentResult[];
  readonly totalTokens: { input: number; output: number };
  readonly durationMs: number;
}

/** Orchestrator 생성자 의존성 */
export interface OrchestratorDeps {
  readonly agentRegistry: SubAgentRegistry;
  readonly executor: ISubAgentExecutor;
  readonly policy: IPolicyProvider;
}

export class Orchestrator {
  private readonly registry: SubAgentRegistry;
  private readonly executor: ISubAgentExecutor;
  private readonly policy: IPolicyProvider;
  private readonly planner: TaskPlanner;

  constructor(deps: OrchestratorDeps) {
    this.registry = deps.agentRegistry;
    this.executor = deps.executor;
    this.policy = deps.policy;
    this.planner = new TaskPlanner();
  }

  /**
   * Goal을 분해하고, Sub-Agent들을 실행하여 최종 결과를 반환한다.
   */
  async run(request: OrchestratorRequest): Promise<OrchestratorResult> {
    const startTime = Date.now();

    // 1. Policy check: 사용자가 이 도메인을 사용할 수 있는지 확인
    const allowedSkills = await this.policy.getAllowedSkills(request.userId);
    const hasAccess =
      allowedSkills.includes('*') || allowedSkills.length > 0;

    if (!hasAccess) {
      return this.createErrorResult(
        'Access denied: user has no allowed skills',
        startTime,
      );
    }

    // 2. Available agents 조회
    const availableAgents = this.registry.getAll();
    if (availableAgents.length === 0) {
      return this.createErrorResult(
        'No sub-agents registered',
        startTime,
      );
    }

    // 3. Goal 분해
    const plan = this.planner.decompose(request.goal, availableAgents);
    if (plan.tasks.length === 0) {
      return this.createErrorResult(
        'Task decomposition produced no tasks',
        startTime,
      );
    }

    // 4. 토폴로지 기반 실행 (dependsOn 준수, 가능한 경우 병렬 실행)
    const context: ExecutionContext = {
      domainId: request.domainId,
      userId: request.userId,
      policy: this.policy,
      timeout: undefined,
    };

    const results: SubAgentResult[] = [];
    const completedTaskIds = new Set<string>();
    const mutableTasks = plan.tasks.map((t) => ({ ...t }));
    let failed = false;

    // Topological execution: run ready tasks in parallel batches
    while (!failed) {
      // Find all tasks whose dependencies are all completed and not yet processed
      const readyTasks = mutableTasks.filter(
        (t) =>
          t.status === 'pending' &&
          t.dependsOn.every((depId) => completedTaskIds.has(depId)),
      );

      if (readyTasks.length === 0) {
        break;
      }

      // Check skill permissions and prepare execution promises
      const executionPromises: Array<{
        task: (typeof mutableTasks)[0];
        promise: Promise<SubAgentResult>;
      }> = [];

      for (const task of readyTasks) {
        const canUse = await this.policy.canUseSkill(
          request.userId,
          task.skillName,
        );
        if (!canUse) {
          task.status = 'skipped';
          results.push({
            agentId: task.agentId,
            skillName: task.skillName,
            success: false,
            summary: '',
            error: `Access denied for skill: ${task.skillName}`,
            tokenUsage: { input: 0, output: 0 },
            durationMs: 0,
          });
          continue;
        }

        task.status = 'running';
        executionPromises.push({
          task,
          promise: this.executor.execute(task, context),
        });
      }

      if (executionPromises.length === 0) {
        continue;
      }

      // Execute all ready tasks in parallel
      const batchResults = await Promise.all(
        executionPromises.map((ep) => ep.promise),
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const task = executionPromises[i].task;
        results.push(result);

        if (result.success) {
          task.status = 'completed';
          completedTaskIds.add(task.taskId);
        } else {
          task.status = 'failed';
          failed = true;
          break;
        }
      }
    }

    // Mark remaining pending tasks as skipped (due to failure)
    if (failed) {
      for (const task of mutableTasks) {
        if (task.status === 'pending') {
          task.status = 'skipped';
        }
      }
    }

    // 5. 결과 조립
    const totalTokens = results.reduce(
      (acc, r) => ({
        input: acc.input + r.tokenUsage.input,
        output: acc.output + r.tokenUsage.output,
      }),
      { input: 0, output: 0 },
    );

    const allSucceeded = results.every((r) => r.success);
    const summaries = results
      .filter((r) => r.success && r.summary)
      .map((r) => r.summary);

    const content = allSucceeded
      ? summaries.join('\n')
      : this.buildErrorContent(results);

    return {
      success: allSucceeded,
      content,
      tasks: mutableTasks,
      results,
      totalTokens,
      durationMs: Date.now() - startTime,
    };
  }

  private createErrorResult(
    message: string,
    startTime: number,
  ): OrchestratorResult {
    return {
      success: false,
      content: message,
      tasks: [],
      results: [],
      totalTokens: { input: 0, output: 0 },
      durationMs: Date.now() - startTime,
    };
  }

  private buildErrorContent(results: SubAgentResult[]): string {
    const errors = results
      .filter((r) => !r.success)
      .map((r) => `[${r.agentId}] ${r.error ?? 'Unknown error'}`);

    const successes = results
      .filter((r) => r.success)
      .map((r) => r.summary);

    const parts: string[] = [];
    if (successes.length > 0) {
      parts.push(`Completed:\n${successes.join('\n')}`);
    }
    parts.push(`Errors:\n${errors.join('\n')}`);
    return parts.join('\n\n');
  }
}
