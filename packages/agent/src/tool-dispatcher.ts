import type { ITool, ToolCall, ToolResult, ToolDescription, JsonObject } from '@cli-agent/core';
import {
  Registry,
  PermissionDeniedError,
  createChildLogger,
} from '@cli-agent/core';
import type { RunContext, AgentLogger } from '@cli-agent/core';
import { PermissionManager } from './permission.js';

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

    let result: ToolResult;
    try {
      result = await tool.execute(params, context);
    } catch (error) {
      if (error instanceof PermissionDeniedError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      result = { success: false, output: '', error: message };
    }

    context.eventBus.emit('tool:end', { runId: context.runId, toolCall, result });
    return result;
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

  getToolDescriptions(): ToolDescription[] {
    const descriptions: ToolDescription[] = [];
    for (const [, tool] of this.toolRegistry.getAll()) {
      descriptions.push(tool.describe());
    }
    return descriptions;
  }
}
