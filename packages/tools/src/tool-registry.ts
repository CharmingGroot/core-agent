import type { ITool } from '@cli-agent/core';
import { Registry } from '@cli-agent/core';
import { FileReadTool } from './file-read.js';
import { FileWriteTool } from './file-write.js';
import { FileSearchTool } from './file-search.js';
import { ShellExecTool } from './shell-exec.js';
import { ReflectTool } from './reflect.js';
import { FileEditTool } from './file-edit.js';
import { ContentSearchTool } from './content-search.js';

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
