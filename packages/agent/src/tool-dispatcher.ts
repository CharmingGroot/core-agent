import type { ITool, ToolCall, ToolResult, ToolDescription, JsonObject } from '@cli-agent/core';
import {
  Registry,
  PermissionDeniedError,
  createChildLogger,
} from '@cli-agent/core';
import type { RunContext, AgentLogger } from '@cli-agent/core';
import { PermissionManager } from './permission.js';

/** Maximum characters in a single tool result output */
const MAX_OUTPUT_CHARS = 80_000;
const TRUNCATION_NOTICE = '\n\n... [output truncated — exceeded 80,000 characters]';

export class ToolDispatcher {
  private readonly toolRegistry: Registry<ITool>;
  private readonly permissionManager: PermissionManager;
  private readonly logger: AgentLogger;

  constructor(toolRegistry: Registry<ITool>, permissionManager: PermissionManager) {
    this.toolRegistry = toolRegistry;
    this.permissionManager = permissionManager;
    this.logger = createChildLogger('tool-dispatcher');
  }

  async dispatch(
    toolCall: ToolCall,
    context: RunContext
  ): Promise<ToolResult> {
    const tool = this.toolRegistry.tryGet(toolCall.name);
    if (!tool) {
      this.logger.warn({ toolName: toolCall.name }, 'Unknown tool');
      return {
        success: false,
        output: '',
        error: `Unknown tool: ${toolCall.name}`,
      };
    }

    let params: JsonObject;
    try {
      params = JSON.parse(toolCall.arguments) as JsonObject;
    } catch {
      this.logger.warn(
        { toolName: toolCall.name, arguments: toolCall.arguments.slice(0, 200) },
        'Invalid JSON in tool arguments',
      );
      return {
        success: false,
        output: '',
        error: `Invalid tool arguments for "${toolCall.name}": ${toolCall.arguments.slice(0, 100)}`,
      };
    }

    const permitted = await this.permissionManager.checkPermission(tool, params);
    if (!permitted) {
      this.logger.info({ toolName: toolCall.name }, 'Permission denied');
      throw new PermissionDeniedError(toolCall.name);
    }

    context.eventBus.emit('tool:start', { runId: context.runId, toolCall });

    let result: ToolResult;
    try {
      result = await tool.execute(params, context);
    } catch (error) {
      if (error instanceof PermissionDeniedError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      result = { success: false, output: '', error: message };
    }

    const truncated = this.truncateResult(result);
    context.eventBus.emit('tool:end', { runId: context.runId, toolCall, result: truncated });
    return truncated;
  }

  async dispatchAll(
    toolCalls: readonly ToolCall[],
    context: RunContext
  ): Promise<ReadonlyMap<string, ToolResult>> {
    const abortedResult: ToolResult = {
      success: false,
      output: '',
      error: 'Operation aborted',
    };

    const entries = await Promise.all(
      toolCalls.map(async (toolCall): Promise<[string, ToolResult]> => {
        if (context.isAborted) {
          return [toolCall.id, abortedResult];
        }
        const result = await this.dispatch(toolCall, context);
        return [toolCall.id, result];
      })
    );

    return new Map(entries);
  }

  private truncateResult(result: ToolResult): ToolResult {
    if (result.output.length <= MAX_OUTPUT_CHARS) return result;
    this.logger.info(
      { originalLength: result.output.length, limit: MAX_OUTPUT_CHARS },
      'Tool output truncated',
    );
    return {
      ...result,
      output: result.output.slice(0, MAX_OUTPUT_CHARS) + TRUNCATION_NOTICE,
    };
  }

  getToolDescriptions(): ToolDescription[] {
    const descriptions: ToolDescription[] = [];
    for (const [, tool] of this.toolRegistry.getAll()) {
      descriptions.push(tool.describe());
    }
    return descriptions;
  }
}
