import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

export class FileWriteTool extends BaseTool {
  readonly name = 'file_write';
  readonly requiresPermission = true;

  constructor() {
    super('file-write');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Write content to a file at a given path, creating directories if needed',
      parameters: [
        this.createParam('path', 'string', 'The file path to write to', true),
        this.createParam('content', 'string', 'The content to write', true),
        this.createParam('encoding', 'string', 'File encoding (default: utf-8)', false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const filePath = params['path'];
    const content = params['content'];

    if (!filePath || typeof filePath !== 'string') {
      return this.failure('Missing or invalid required parameter: path (expected string)');
    }
    if (content === undefined || content === null || typeof content !== 'string') {
      return this.failure('Missing or invalid required parameter: content (expected string)');
    }

    const rawEncoding = params['encoding'];
    const encoding = (typeof rawEncoding === 'string' ? rawEncoding : 'utf-8');
    const absolutePath = this.resolveSafePath(context.workingDirectory, filePath);
    if (!absolutePath) {
      return this.failure('Path traversal denied: path escapes working directory');
    }

    try {
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, { encoding: encoding as BufferEncoding });
      return this.success(`File written: ${absolutePath}`, { path: absolutePath });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to write file: ${msg}`);
    }
  }
}
