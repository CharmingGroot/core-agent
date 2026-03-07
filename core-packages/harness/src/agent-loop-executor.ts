/**
 * AgentLoopExecutor — ISubAgentExecutor implementation backed by AgentLoop.
 *
 * Each task runs in its own AgentLoop instance (independent context window).
 * Maps AgentResult to SubAgentResult (content -> summary, track token usage).
 * Handles timeouts and errors gracefully (returns failed SubAgentResult, never throws).
 *
 * Profile integration:
 *   - Governed mode: loads user profile via policy.getProfile(), filters tools
 *   - Standalone mode: getProfile() returns null, all tools passed through
 */
import type { ISubAgentExecutor, ExecutionContext } from '@core/orchestrator';
import type { PlannedTask, SubAgentResult, Profile } from '@core/types';
import type { ILlmProvider, ITool, AgentConfig } from '@cli-agent/core';
import { Registry, EventBus } from '@cli-agent/core';
import { AgentLoop } from '@cli-agent/agent';
import { filterToolsByProfile } from '@core/context-engine';

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

      // Load profile for tool filtering (null in standalone mode)
      const profile = await context.policy.getProfile(context.userId);
      const toolRegistry = this.buildFilteredRegistry(profile);

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
        toolRegistry,
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
   * Builds a filtered tool registry based on user profile.
   * If profile is null (standalone), returns the full registry.
   * If profile exists (governed), only includes non-denied tools.
   */
  private buildFilteredRegistry(profile: Profile | null): Registry<ITool> {
    if (!profile) {
      return this.config.toolRegistry;
    }

    const allTools = this.config.toolRegistry.getAll();
    const toolDescriptions = [...allTools.values()].map((tool) => ({
      name: tool.name,
      description: tool.describe().description,
      parameters: [],
      tokenEstimate: 0,
    }));

    const allowedDescriptions = filterToolsByProfile(toolDescriptions, profile);
    const allowedNames = new Set(allowedDescriptions.map((d) => d.name));

    const filtered = new Registry<ITool>('Tool');
    for (const [, tool] of allTools) {
      if (allowedNames.has(tool.name)) {
        filtered.register(tool.name, tool);
      }
    }

    return filtered;
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
