import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
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
    const filePath = params['path'] as string;
    const content = params['content'] as string;

    if (!filePath) {
      return this.failure('Missing required parameter: path');
    }
    if (content === undefined || content === null) {
      return this.failure('Missing required parameter: content');
    }

    const encoding = (params['encoding'] as string) ?? 'utf-8';
    const absolutePath = resolve(context.workingDirectory, filePath);

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
