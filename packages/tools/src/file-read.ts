import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

export class FileReadTool extends BaseTool {
  readonly name = 'file_read';
  readonly requiresPermission = false;

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Read the contents of a file at a given path',
      parameters: [
        this.createParam('path', 'string', 'The file path to read', true),
        this.createParam('encoding', 'string', 'File encoding (default: utf-8)', false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const filePath = params['path'] as string;
    if (!filePath) {
      return this.failure('Missing required parameter: path');
    }

    const encoding = (params['encoding'] as string) ?? 'utf-8';
    const absolutePath = resolve(context.workingDirectory, filePath);

    try {
      const content = await readFile(absolutePath, { encoding: encoding as BufferEncoding });
      return this.success(content, { path: absolutePath });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to read file: ${msg}`);
    }
  }
}
