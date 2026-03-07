import { exec } from 'node:child_process';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

const TIMEOUT_MS = 10000;
const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;

export class GitLogTool extends BaseTool {
  readonly name = 'git_log';
  readonly requiresPermission = false;

  constructor() {
    super('git-log');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Show recent commit history. Read-only git operation.',
      parameters: [
        this.createParam('count', 'number', `Number of commits to show (default: ${DEFAULT_COUNT}, max: ${MAX_COUNT})`, false),
        this.createParam('oneline', 'boolean', 'Use compact one-line format (default: true)', false),
        this.createParam('file', 'string', 'Show history for a specific file path', false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const rawCount = typeof params['count'] === 'number' ? params['count'] : DEFAULT_COUNT;
    const count = Math.min(Math.max(1, Math.floor(rawCount)), MAX_COUNT);
    const oneline = params['oneline'] !== false; // default true
    const file = typeof params['file'] === 'string' ? params['file'] : '';

    const args = ['git', 'log', `-${count}`];
    if (oneline) {
      args.push('--oneline', '--decorate');
    } else {
      args.push('--format="%H %an %ad  %s"', '--date=short');
    }
    if (file) {
      args.push('--', file);
    }

    const command = args.join(' ');

    return new Promise<ToolResult>((resolve) => {
      exec(
        command,
        { cwd: context.workingDirectory, timeout: TIMEOUT_MS, signal: context.signal },
        (error, stdout, stderr) => {
          if (error) {
            resolve(this.failure(`git log failed: ${stderr || error.message}`));
            return;
          }
          resolve(this.success(stdout || '(no commits)'));
        },
      );
    });
  }
}
