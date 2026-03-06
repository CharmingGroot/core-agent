import type { ITool } from '@cli-agent/core';

export type PermissionHandler = (toolName: string) => Promise<boolean>;

const AUTO_APPROVE: PermissionHandler = async () => true;

export class PermissionManager {
  private readonly handler: PermissionHandler;
  private readonly allowedTools = new Set<string>();

  constructor(handler?: PermissionHandler) {
    this.handler = handler ?? AUTO_APPROVE;
  }

  async checkPermission(tool: ITool): Promise<boolean> {
    if (!tool.requiresPermission) {
      return true;
    }

    if (this.allowedTools.has(tool.name)) {
      return true;
    }

    return this.handler(tool.name);
  }

  allowTool(toolName: string): void {
    this.allowedTools.add(toolName);
  }

  revokeTool(toolName: string): void {
    this.allowedTools.delete(toolName);
  }

  isAllowed(toolName: string): boolean {
    return this.allowedTools.has(toolName);
  }

  clearAllowed(): void {
    this.allowedTools.clear();
  }
}
