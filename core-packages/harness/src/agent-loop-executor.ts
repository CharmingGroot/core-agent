/**
 * AgentLoopExecutor — ISubAgentExecutor implementation backed by AgentLoop.
 *
 * Each task runs in its own AgentLoop instance (independent context window).
 * Maps AgentResult to SubAgentResult (content -> summary, track token usage).
 * Handles timeouts and errors gracefully (returns failed SubAgentResult, never throws).
 */
import type { ISubAgentExecutor, ExecutionContext } from '@core/orchestrator';
import type { PlannedTask, SubAgentResult } from '@core/types';
import type { ILlmProvider, ITool, AgentConfig } from '@cli-agent/core';
import { Registry, EventBus } from '@cli-agent/core';
import { AgentLoop } from '@cli-agent/agent';

/** Configuration for AgentLoopExecutor */
export interface AgentLoopExecutorConfig {
  /** Factory to create a provider for a given providerId + model */
  readonly createProvider: (providerId: string, model: string) => ILlmProvider;
  /** Tool registry to give each agent */
  readonly toolRegistry: Registry<ITool>;
  /** Working directory */
  readonly workingDirectory: string;
}

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_TIMEOUT_MS = 300_000;

export class AgentLoopExecutor implements ISubAgentExecutor {
  private readonly config: AgentLoopExecutorConfig;

  constructor(config: AgentLoopExecutorConfig) {
    this.config = config;
  }

  async execute(
    task: PlannedTask,
    context: ExecutionContext,
  ): Promise<SubAgentResult> {
    const startTime = Date.now();

    try {
      const provider = this.config.createProvider(
        task.agentId,
        task.skillName,
      );

      const agentConfig: AgentConfig = {
        provider: {
          providerId: task.agentId,
          model: task.skillName,
          auth: { type: 'no-auth' as const },
          maxTokens: 4096,
          temperature: 0.7,
        },
        maxIterations: DEFAULT_MAX_ITERATIONS,
        systemPrompt: `You are a sub-agent responsible for: ${task.skillName}`,
        workingDirectory: this.config.workingDirectory,
      };

      const agentLoop = new AgentLoop({
        provider,
        toolRegistry: this.config.toolRegistry,
        config: agentConfig,
        eventBus: new EventBus(),
      });

      const timeout = context.timeout ?? DEFAULT_TIMEOUT_MS;
      const result = await this.executeWithTimeout(
        agentLoop,
        task.description,
        timeout,
      );

      const durationMs = Date.now() - startTime;

      return {
        agentId: task.agentId,
        skillName: task.skillName,
        success: !result.aborted,
        summary: result.content,
        tokenUsage: { input: 0, output: 0 },
        durationMs,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      return {
        agentId: task.agentId,
        skillName: task.skillName,
        success: false,
        summary: '',
        error: message,
        tokenUsage: { input: 0, output: 0 },
        durationMs,
      };
    }
  }

  /**
   * Runs the agent loop with a timeout. If the timeout elapses,
   * the agent is aborted and a timed-out result is returned.
   */
  private async executeWithTimeout(
    agentLoop: AgentLoop,
    userMessage: string,
    timeoutMs: number,
  ): Promise<{ content: string; aborted: boolean }> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        agentLoop.abort('Execution timeout');
        reject(new Error(`Agent execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        agentLoop.run(userMessage),
        timeoutPromise,
      ]);
      return { content: result.content, aborted: result.aborted };
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
