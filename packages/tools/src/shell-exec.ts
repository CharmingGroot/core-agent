import { exec } from 'node:child_process';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_LENGTH = 100000;

export class ShellExecTool extends BaseTool {
  readonly name = 'shell_exec';

  constructor() {
    super('shell-exec');
  }
  readonly requiresPermission = true;

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Execute a shell command in the working directory',
      parameters: [
        this.createParam('command', 'string', 'The shell command to execute', true),
        this.createParam('timeoutMs', 'number', `Timeout in ms (default: ${DEFAULT_TIMEOUT_MS})`, false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const command = params['command'] as string;
    if (!command) {
      return this.failure('Missing required parameter: command');
    }

    const timeoutMs = (params['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;

    return new Promise<ToolResult>((resolve) => {
      const child = exec(
        command,
        {
          cwd: context.workingDirectory,
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_LENGTH,
          signal: context.signal,
        },
        (error, stdout, stderr) => {
          const truncatedStdout = stdout.length > MAX_OUTPUT_LENGTH
            ? stdout.slice(0, MAX_OUTPUT_LENGTH) + '\n...(truncated)'
            : stdout;
          const truncatedStderr = stderr.length > MAX_OUTPUT_LENGTH
            ? stderr.slice(0, MAX_OUTPUT_LENGTH) + '\n...(truncated)'
            : stderr;

          if (error) {
            const exitCode = error.code ?? -1;
            resolve(
              this.failure(
                `Command failed (exit code ${exitCode}): ${error.message}`,
                `stdout:\n${truncatedStdout}\nstderr:\n${truncatedStderr}`
              )
            );
            return;
          }

          const output = truncatedStdout + (truncatedStderr ? `\nstderr:\n${truncatedStderr}` : '');
          resolve(this.success(output, { exitCode: 0 }));
        }
      );

      context.signal.addEventListener(
        'abort',
        () => {
          child.kill('SIGTERM');
        },
        { once: true }
      );
    });
  }
}
