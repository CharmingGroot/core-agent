import { resolve, normalize, sep } from 'node:path';
import type {
  ITool,
  ToolDescription,
  ToolParameter,
  ToolResult,
  JsonObject,
} from '@cli-agent/core';
import { createChildLogger, ToolExecutionError } from '@cli-agent/core';
import type { RunContext, AgentLogger } from '@cli-agent/core';

export abstract class BaseTool implements ITool {
  abstract readonly name: string;
  abstract readonly requiresPermission: boolean;
  protected readonly logger: AgentLogger;

  constructor(loggerName: string) {
    this.logger = createChildLogger(loggerName);
  }

  abstract describe(): ToolDescription;
  abstract run(params: JsonObject, context: RunContext): Promise<ToolResult>;

  /**
   * Resolve a user-supplied file path against the working directory,
   * ensuring the result stays within the allowed boundary.
   * Returns the resolved absolute path, or null if the path escapes.
   */
  protected resolveSafePath(workingDirectory: string, filePath: string): string | null {
    const resolved = normalize(resolve(workingDirectory, filePath));
    const boundary = normalize(workingDirectory) + sep;
    // Allow exact match (the directory itself) or anything inside it
    if (resolved === normalize(workingDirectory) || resolved.startsWith(boundary)) {
      return resolved;
    }
    return null;
  }

  async execute(params: JsonObject, context: RunContext): Promise<ToolResult> {
    this.logger.debug({ tool: this.name, params }, 'Executing tool');
    try {
      const result = await this.run(params, context);
      this.logger.debug({ tool: this.name, success: result.success }, 'Tool completed');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ tool: this.name, error: message }, 'Tool failed');
      throw new ToolExecutionError(this.name, message, error instanceof Error ? error : undefined);
    }
  }

  protected createParam(
    name: string,
    type: string,
    description: string,
    required: boolean
  ): ToolParameter {
    return { name, type, description, required };
  }

  protected success(output: string, metadata?: JsonObject): ToolResult {
    return { success: true, output, metadata };
  }

  protected failure(error: string, output = ''): ToolResult {
    return { success: false, output, error };
  }
}
