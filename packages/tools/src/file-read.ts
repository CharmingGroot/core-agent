import { readFile } from 'node:fs/promises';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

export class FileReadTool extends BaseTool {
  readonly name = 'file_read';
  readonly requiresPermission = false;

  constructor() {
    super('file-read');
  }

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
    const filePath = params['path'];
    if (!filePath || typeof filePath !== 'string') {
      return this.failure('Missing or invalid required parameter: path (expected string)');
    }

    const rawEncoding = params['encoding'];
    const encoding = (typeof rawEncoding === 'string' ? rawEncoding : 'utf-8');
    const absolutePath = this.resolveSafePath(context.workingDirectory, filePath);
    if (!absolutePath) {
      return this.failure('Path traversal denied: path escapes working directory');
    }

    try {
      const content = await readFile(absolutePath, { encoding: encoding as BufferEncoding });
      return this.success(content, { path: absolutePath });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to read file: ${msg}`);
    }
  }
}
