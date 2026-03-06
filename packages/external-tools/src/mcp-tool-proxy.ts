import type {
  ITool,
  ToolDescription,
  ToolResult,
  ToolParameter,
  JsonObject,
} from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { createChildLogger, ToolExecutionError } from '@cli-agent/core';
import type { McpClient } from './mcp-client.js';
import type { McpToolDefinition, McpContent } from './mcp-types.js';

/**
 * Wraps an MCP tool as a standard ITool so it can be registered
 * in the tool registry alongside built-in tools.
 *
 * Tool name is prefixed with the server name to avoid collisions:
 * e.g. "github__create_issue" for server "github", tool "create_issue"
 */
export class McpToolProxy implements ITool {
  readonly name: string;
  readonly requiresPermission = true;
  private readonly serverName: string;
  private readonly toolDef: McpToolDefinition;
  private readonly client: McpClient;
  private readonly logger;

  constructor(client: McpClient, toolDef: McpToolDefinition) {
    this.client = client;
    this.toolDef = toolDef;
    this.serverName = client.serverName;
    this.name = `${this.serverName}__${toolDef.name}`;
    this.logger = createChildLogger(`mcp-proxy:${this.name}`);
  }

  /** Original MCP tool name (without server prefix) */
  get originalName(): string {
    return this.toolDef.name;
  }

  describe(): ToolDescription {
    const parameters: ToolParameter[] = [];
    const schema = this.toolDef.inputSchema;
    const required = new Set(schema.required ?? []);

    if (schema.properties) {
      for (const [paramName, paramSchema] of Object.entries(schema.properties)) {
        parameters.push({
          name: paramName,
          type: paramSchema.type,
          description: paramSchema.description ?? '',
          required: required.has(paramName),
        });
      }
    }

    return {
      name: this.name,
      description: this.toolDef.description ?? `MCP tool from ${this.serverName}`,
      parameters,
    };
  }

  async execute(params: JsonObject, _context: RunContext): Promise<ToolResult> {
    this.logger.debug({ tool: this.name, params }, 'Calling MCP tool');

    try {
      const result = await this.client.callTool(this.toolDef.name, params);

      const output = this.extractText(result.content);

      if (result.isError) {
        return { success: false, output, error: output };
      }

      return { success: true, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ tool: this.name, error: message }, 'MCP tool call failed');
      throw new ToolExecutionError(this.name, message, error instanceof Error ? error : undefined);
    }
  }

  private extractText(content: readonly McpContent[]): string {
    return content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join('\n');
  }
}
