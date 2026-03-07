import { exec } from 'node:child_process';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

const TIMEOUT_MS = 15000;
const MAX_OUTPUT = 80000;

export class GitDiffTool extends BaseTool {
  readonly name = 'git_diff';
  readonly requiresPermission = false;

  constructor() {
    super('git-diff');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description:
        'Show changes in the working tree. By default shows unstaged changes. ' +
        'Use staged=true for staged changes, or provide a target (branch, commit, file path).',
      parameters: [
        this.createParam('staged', 'boolean', 'Show staged (--cached) changes', false),
        this.createParam('target', 'string', 'Branch, commit SHA, or file path to diff against', false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const staged = params['staged'] === true;
    const target = typeof params['target'] === 'string' ? params['target'] : '';

    const args = ['git', 'diff', '--stat', '--patch'];
    if (staged) args.push('--cached');
    if (target) args.push(target);

    const command = args.join(' ');

    return new Promise<ToolResult>((resolve) => {
      exec(
        command,
        { cwd: context.workingDirectory, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, signal: context.signal },
        (error, stdout, stderr) => {
          if (error) {
            resolve(this.failure(`git diff failed: ${stderr || error.message}`));
            return;
          }
          resolve(this.success(stdout || '(no changes)'));
        },
      );
    });
  }
}
