import type {
  ITool,
  ILlmProvider,
  ToolDescription,
  ToolResult,
  JsonObject,
  AgentLogger,
} from '@cli-agent/core';
import { Registry, RunContext, createChildLogger } from '@cli-agent/core';
import { AgentLoop } from './agent-loop.js';
import type { SystemPromptBuilder } from './agent-loop.js';
import type { PermissionHandler } from './permission.js';

/** Configuration for creating a sub-agent tool. */
export interface SubAgentToolConfig {
  /** Display name for this sub-agent tool */
  readonly name: string;
  /** Description shown to the parent agent */
  readonly description: string;
  /** LLM provider the sub-agent will use */
  readonly provider: ILlmProvider;
  /** Tools available to the sub-agent */
  readonly toolRegistry: Registry<ITool>;
  /** System prompt or dynamic builder for the sub-agent */
  readonly systemPrompt?: string;
  readonly systemPromptBuilder?: SystemPromptBuilder;
  /** Max iterations for the sub-agent (default: 25) */
  readonly maxIterations?: number;
  /** Permission handler for the sub-agent's tools */
  readonly permissionHandler?: PermissionHandler;
}

const DEFAULT_MAX_ITERATIONS = 25;

/**
 * Wraps an AgentLoop as an ITool so a parent agent can delegate
 * sub-tasks to a child agent via tool calls.
 *
 * The parent sends a "task" parameter; the sub-agent runs autonomously
 * and returns the final result as tool output.
 */
export class SubAgentTool implements ITool {
  readonly name: string;
  readonly requiresPermission = false;

  private readonly config: SubAgentToolConfig;
  private readonly logger: AgentLogger;

  constructor(config: SubAgentToolConfig) {
    this.name = config.name;
    this.config = config;
    this.logger = createChildLogger(`sub-agent:${config.name}`);
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description: this.config.description,
      parameters: [
        {
          name: 'task',
          type: 'string',
          description: 'The task to delegate to the sub-agent',
          required: true,
        },
      ],
    };
  }

  async execute(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const task = params['task'];
    if (typeof task !== 'string' || task.trim().length === 0) {
      return { success: false, output: '', error: 'Missing or empty "task" parameter' };
    }

    this.logger.info({ task: task.slice(0, 200) }, 'Sub-agent starting');

    const childLoop = new AgentLoop({
      provider: this.config.provider,
      toolRegistry: this.config.toolRegistry,
      config: {
        provider: {
          providerId: this.config.provider.providerId,
          model: 'sub-agent',
          auth: { type: 'api-key' as const, apiKey: '' },
          maxTokens: 4096,
          temperature: 0.7,
        },
        maxIterations: this.config.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        workingDirectory: context.workingDirectory,
        systemPrompt: this.config.systemPrompt,
      },
      permissionHandler: this.config.permissionHandler,
      systemPromptBuilder: this.config.systemPromptBuilder,
    });

    // Propagate abort from parent context to child via AbortSignal
    const onAbort = () => childLoop.abort('Parent aborted');
    context.signal.addEventListener('abort', onAbort, { once: true });

    try {
      const result = await childLoop.run(task);

      this.logger.info(
        { iterations: result.iterations, aborted: result.aborted },
        'Sub-agent completed',
      );

      if (result.aborted) {
        return { success: false, output: result.content, error: 'Sub-agent was aborted' };
      }

      return { success: true, output: result.content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ error: message }, 'Sub-agent failed');
      return { success: false, output: '', error: `Sub-agent error: ${message}` };
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  }
}
