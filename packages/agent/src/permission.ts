import type { ITool, JsonObject } from '@cli-agent/core';

/**
 * Approval level returned by PermissionHandler.
 *
 * - 'once'    — allow this single invocation only
 * - 'session' — allow for the rest of this session (cached in allowedTools)
 * - 'always'  — allow permanently (caller is responsible for persistence)
 * - 'deny'    — block this invocation
 */
export type ApprovalLevel = 'once' | 'session' | 'always' | 'deny';

/**
 * Decision returned by PermissionHandler.
 * Can be a simple boolean (backward-compatible) or an ApprovalLevel.
 */
export type PermissionDecision = boolean | ApprovalLevel;

/**
 * Callback that decides whether a tool invocation is allowed.
 * Receives the tool name and the parsed parameters so the handler
 * can make context-aware decisions (e.g., block `rm -rf /`).
 */
export type PermissionHandler = (
  toolName: string,
  params: JsonObject,
) => Promise<PermissionDecision>;

/** Callback invoked when a tool is approved with 'always' level */
export type PersistApprovalCallback = (toolName: string) => void;

const AUTO_APPROVE: PermissionHandler = async () => true;

function normalizeDecision(decision: PermissionDecision): ApprovalLevel {
  if (decision === true) return 'session';
  if (decision === false) return 'deny';
  return decision;
}

export class PermissionManager {
  private readonly handler: PermissionHandler;
  private readonly sessionAllowed = new Set<string>();
  private readonly alwaysAllowed = new Set<string>();
  private readonly onPersist: PersistApprovalCallback | undefined;

  constructor(
    handler?: PermissionHandler,
    onPersist?: PersistApprovalCallback,
  ) {
    this.handler = handler ?? AUTO_APPROVE;
    this.onPersist = onPersist;
  }

  async checkPermission(tool: ITool, params: JsonObject = {}): Promise<boolean> {
    if (!tool.requiresPermission) {
      return true;
    }

    if (this.alwaysAllowed.has(tool.name) || this.sessionAllowed.has(tool.name)) {
      return true;
    }

    const raw = await this.handler(tool.name, params);
    const level = normalizeDecision(raw);

    if (level === 'deny') return false;

    if (level === 'session') {
      this.sessionAllowed.add(tool.name);
    } else if (level === 'always') {
      this.alwaysAllowed.add(tool.name);
      this.onPersist?.(tool.name);
    }
    // 'once' — no caching, just allow this time

    return true;
  }

  allowTool(toolName: string, level: 'session' | 'always' = 'session'): void {
    if (level === 'always') {
      this.alwaysAllowed.add(toolName);
    } else {
      this.sessionAllowed.add(toolName);
    }
  }

  revokeTool(toolName: string): void {
    this.sessionAllowed.delete(toolName);
    this.alwaysAllowed.delete(toolName);
  }

  isAllowed(toolName: string): boolean {
    return this.sessionAllowed.has(toolName) || this.alwaysAllowed.has(toolName);
  }

  clearSession(): void {
    this.sessionAllowed.clear();
  }

  clearAll(): void {
    this.sessionAllowed.clear();
    this.alwaysAllowed.clear();
  }
}
