import type { ITool } from '@cli-agent/core';
import { Registry } from '@cli-agent/core';
import { FileReadTool } from './file-read.js';
import { FileWriteTool } from './file-write.js';
import { FileSearchTool } from './file-search.js';
import { ShellExecTool } from './shell-exec.js';
import { ReflectTool } from './reflect.js';
import { FileEditTool } from './file-edit.js';
import { ContentSearchTool } from './content-search.js';
import { GitStatusTool } from './git-status.js';
import { GitDiffTool } from './git-diff.js';
import { GitLogTool } from './git-log.js';

export function createToolRegistry(): Registry<ITool> {
  const registry = new Registry<ITool>('Tool');

  const defaultTools: ITool[] = [
    new FileReadTool(),
    new FileWriteTool(),
    new FileSearchTool(),
    new ShellExecTool(),
    new ReflectTool(),
    new FileEditTool(),
    new ContentSearchTool(),
  ];

  for (const tool of defaultTools) {
    registry.register(tool.name, tool);
  }

  return registry;
}

/**
 * Register Git tools (git_status, git_diff, git_log) into an existing registry.
 * These are opt-in — not included in createToolRegistry() by default.
 *
 * Usage:
 *   const registry = createToolRegistry();
 *   registerGitTools(registry);
 */
export function registerGitTools(registry: Registry<ITool>): void {
  const gitTools: ITool[] = [
    new GitStatusTool(),
    new GitDiffTool(),
    new GitLogTool(),
  ];
  for (const tool of gitTools) {
    registry.register(tool.name, tool);
  }
}
