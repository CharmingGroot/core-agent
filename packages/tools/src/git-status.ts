import { exec } from 'node:child_process';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

const TIMEOUT_MS = 10000;

export class GitStatusTool extends BaseTool {
  readonly name = 'git_status';
  readonly requiresPermission = false;

  constructor() {
    super('git-status');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Show the working tree status (staged, unstaged, untracked files). Read-only git operation.',
      parameters: [],
    };
  }

  async run(_params: JsonObject, context: RunContext): Promise<ToolResult> {
    return new Promise<ToolResult>((resolve) => {
      exec(
        'git status --short --branch',
        { cwd: context.workingDirectory, timeout: TIMEOUT_MS, signal: context.signal },
        (error, stdout, stderr) => {
          if (error) {
            resolve(this.failure(`git status failed: ${stderr || error.message}`));
            return;
          }
          resolve(this.success(stdout || '(clean working tree)'));
        },
      );
    });
  }
}
