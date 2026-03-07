import type {
  ILlmProvider,
  ITool,
  AgentConfig,
  ToolDescription,
  LlmResponse,
  Message,
  AgentLogger,
} from '@cli-agent/core';
import {
  Registry,
  RunContext,
  EventBus,
  AbortError,
  createChildLogger,
} from '@cli-agent/core';
import { MessageManager } from './message-manager.js';
import { ToolDispatcher } from './tool-dispatcher.js';
import { PermissionManager, type PermissionHandler } from './permission.js';

/**
 * Callback that builds/rebuilds the system prompt dynamically.
 * Called before each LLM iteration so the prompt can reflect
 * current state (open files, cwd, etc.) without a hard dependency
 * on @core/context-engine.
 */
export type SystemPromptBuilder = (context: RunContext) => string | Promise<string>;

export interface AgentLoopOptions {
  provider: ILlmProvider;
  toolRegistry: Registry<ITool>;
  config: AgentConfig;
  permissionHandler?: PermissionHandler;
  eventBus?: EventBus;
  streaming?: boolean;
  /** Dynamic system prompt builder — takes precedence over config.systemPrompt */
  systemPromptBuilder?: SystemPromptBuilder;
}

export interface AgentResult {
  readonly content: string;
  readonly runId: string;
  readonly iterations: number;
  readonly aborted: boolean;
}

export class AgentLoop {
  private readonly provider: ILlmProvider;
  private readonly toolDispatcher: ToolDispatcher;
  private readonly messageManager: MessageManager;
  private readonly context: RunContext;
  private readonly maxIterations: number;
  private readonly logger: AgentLogger;
  private readonly streaming: boolean;
  private readonly systemPromptBuilder?: SystemPromptBuilder;
  private iterations = 0;

  constructor(options: AgentLoopOptions) {
    const eventBus = options.eventBus ?? new EventBus();
    this.context = new RunContext(options.config, eventBus);
    this.provider = options.provider;
    this.messageManager = new MessageManager();
    this.maxIterations = options.config.maxIterations;
    this.logger = createChildLogger('agent-loop');
    this.streaming = options.streaming ?? false;
    this.systemPromptBuilder = options.systemPromptBuilder;

    const permissionManager = new PermissionManager(options.permissionHandler);
    this.toolDispatcher = new ToolDispatcher(options.toolRegistry, permissionManager);

    // Static system prompt used only when no dynamic builder is provided
    if (!this.systemPromptBuilder && options.config.systemPrompt) {
      this.messageManager.addSystemMessage(options.config.systemPrompt);
    }
  }

  get runId(): string {
    return this.context.runId;
  }

  get eventBus(): EventBus {
    return this.context.eventBus;
  }

  async run(userMessage: string): Promise<AgentResult> {
    this.messageManager.addUserMessage(userMessage);
    this.context.eventBus.emit('agent:start', { runId: this.context.runId });
    this.iterations = 0;

    try {
      let lastContent = '';

      while (this.iterations < this.maxIterations) {
        if (this.context.isAborted) {
          throw new AbortError('Agent loop aborted');
        }

        this.iterations++;
        this.logger.debug({ iteration: this.iterations }, 'Starting iteration');

        // Rebuild system prompt dynamically if builder is provided
        if (this.systemPromptBuilder) {
          const prompt = await this.systemPromptBuilder(this.context);
          this.messageManager.setSystemMessage(prompt);
        }

        const compressed = this.messageManager.compressIfNeeded();
        if (compressed > 0) {
          this.logger.info({ compressed }, 'History compressed');
        }

        const toolDescriptions = this.getToolDescriptions();
        const messages = this.messageManager.getMessages();

        this.context.eventBus.emit('llm:request', {
          runId: this.context.runId,
          messages,
        });

        const response = this.streaming
          ? await this.streamResponse(messages, toolDescriptions)
          : await this.provider.chat(messages, toolDescriptions);

        this.context.eventBus.emit('llm:response', {
          runId: this.context.runId,
          response,
        });

        lastContent = response.content;

        if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
          this.messageManager.addAssistantMessage(response.content);
          break;
        }

        // Tool use flow
        this.messageManager.addAssistantMessage(response.content, response.toolCalls);
        const results = await this.toolDispatcher.dispatchAll(
          response.toolCalls,
          this.context
        );
        this.messageManager.addToolResults(results);
      }

      const aborted = this.context.isAborted;
      this.context.eventBus.emit('agent:end', {
        runId: this.context.runId,
        reason: aborted ? 'aborted' : 'complete',
      });

      return {
        content: lastContent,
        runId: this.context.runId,
        iterations: this.iterations,
        aborted,
      };
    } catch (error) {
      this.context.eventBus.emit('agent:error', {
        runId: this.context.runId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  abort(reason?: string): void {
    this.context.abort(reason);
  }

  getContext(): RunContext {
    return this.context;
  }

  private async streamResponse(
    messages: readonly Message[],
    tools: ToolDescription[]
  ): Promise<LlmResponse> {
    let finalResponse: LlmResponse | undefined;

    for await (const event of this.provider.stream(messages, tools)) {
      if (event.type === 'text_delta' && event.content) {
        this.context.eventBus.emit('llm:stream', {
          runId: this.context.runId,
          chunk: event.content,
        });
      } else if (event.type === 'done' && event.response) {
        finalResponse = event.response;
      }
    }

    if (!finalResponse) {
      throw new Error('Stream ended without a final response');
    }
    return finalResponse;
  }

  private getToolDescriptions(): ToolDescription[] {
    return this.toolDispatcher.getToolDescriptions();
  }
}
