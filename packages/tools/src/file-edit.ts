import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

export class FileEditTool extends BaseTool {
  readonly name = 'file_edit';
  readonly requiresPermission = true;

  constructor() {
    super('file-edit');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description:
        'Edit a file by replacing an exact string match with new content. ' +
        'The old_string must match exactly (including whitespace/indentation). ' +
        'Use replace_all to replace every occurrence.',
      parameters: [
        this.createParam('path', 'string', 'The file path to edit', true),
        this.createParam('old_string', 'string', 'The exact text to find and replace', true),
        this.createParam('new_string', 'string', 'The replacement text', true),
        this.createParam('replace_all', 'boolean', 'Replace all occurrences (default: false)', false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const filePath = params['path'];
    const oldString = params['old_string'];
    const newString = params['new_string'];

    if (!filePath || typeof filePath !== 'string') {
      return this.failure('Missing or invalid required parameter: path (expected string)');
    }
    if (typeof oldString !== 'string') {
      return this.failure('Missing or invalid required parameter: old_string (expected string)');
    }
    if (typeof newString !== 'string') {
      return this.failure('Missing or invalid required parameter: new_string (expected string)');
    }

    const replaceAll = params['replace_all'] === true;
    const absolutePath = resolve(context.workingDirectory, filePath);

    if (!existsSync(absolutePath)) {
      return this.failure(`File not found: ${absolutePath}`);
    }

    try {
      const content = await readFile(absolutePath, 'utf-8');

      if (!content.includes(oldString)) {
        return this.failure(
          'old_string not found in file. Ensure it matches exactly (including whitespace and indentation).'
        );
      }

      const occurrences = content.split(oldString).length - 1;

      if (!replaceAll && occurrences > 1) {
        return this.failure(
          `old_string has ${occurrences} occurrences. Provide more context to make it unique, or set replace_all=true.`
        );
      }

      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      await writeFile(absolutePath, updated, 'utf-8');

      const replacedCount = replaceAll ? occurrences : 1;
      return this.success(
        `Edited ${absolutePath}: replaced ${replacedCount} occurrence(s)`,
        { path: absolutePath, replacedCount }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.failure(`Failed to edit file: ${msg}`);
    }
  }
}
