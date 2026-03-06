import fg from 'fast-glob';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

const MAX_RESULTS = 100;

export class FileSearchTool extends BaseTool {
  readonly name = 'file_search';
  readonly requiresPermission = false;

  constructor() {
    super('file-search');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Search for files matching a glob pattern in the working directory',
      parameters: [
        this.createParam('pattern', 'string', 'Glob pattern to match files', true),
        this.createParam('maxResults', 'number', `Maximum results to return (default: ${MAX_RESULTS})`, false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const pattern = params['pattern'] as string;
    if (!pattern) {
      return this.failure('Missing required parameter: pattern');
    }

    const maxResults = (params['maxResults'] as number) ?? MAX_RESULTS;

    try {
      const files = await fg(pattern, {
        cwd: context.workingDirectory,
        absolute: true,
        onlyFiles: true,
        dot: false,
      });

      const limited = files.slice(0, maxResults);
      const output = limited.length > 0
        ? limited.join('\n')
        : 'No files found matching pattern';

      return this.success(output, {
        count: limited.length,
        totalFound: files.length,
        truncated: files.length > maxResults,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.failure(`File search failed: ${msg}`);
    }
  }
}
