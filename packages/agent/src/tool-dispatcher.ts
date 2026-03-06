import type { ITool, ToolCall, ToolResult, JsonObject } from '@cli-agent/core';
import {
  Registry,
  ToolExecutionError,
  PermissionDeniedError,
  createChildLogger,
} from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { PermissionManager } from './permission.js';
import type { Logger } from 'pino';

export class ToolDispatcher {
  private readonly toolRegistry: Registry<ITool>;
  private readonly permissionManager: PermissionManager;
  private readonly logger: Logger;

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

    const permitted = await this.permissionManager.checkPermission(tool);
    if (!permitted) {
      this.logger.info({ toolName: toolCall.name }, 'Permission denied');
      throw new PermissionDeniedError(toolCall.name);
    }

    context.eventBus.emit('tool:start', { runId: context.runId, toolCall });

    let params: JsonObject;
    try {
      params = JSON.parse(toolCall.arguments) as JsonObject;
    } catch {
      return {
        success: false,
        output: '',
        error: `Invalid tool arguments: ${toolCall.arguments}`,
      };
    }

    try {
      const result = await tool.execute(params, context);
      context.eventBus.emit('tool:end', { runId: context.runId, toolCall, result });
      return result;
    } catch (error) {
      if (error instanceof PermissionDeniedError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const result: ToolResult = { success: false, output: '', error: message };
      context.eventBus.emit('tool:end', { runId: context.runId, toolCall, result });
      return result;
    }
  }

  async dispatchAll(
    toolCalls: readonly ToolCall[],
    context: RunContext
  ): Promise<ReadonlyMap<string, ToolResult>> {
    const results = new Map<string, ToolResult>();

    for (const toolCall of toolCalls) {
      if (context.isAborted) {
        results.set(toolCall.id, {
          success: false,
          output: '',
          error: 'Operation aborted',
        });
        continue;
      }

      const result = await this.dispatch(toolCall, context);
      results.set(toolCall.id, result);
    }

    return results;
  }
}
