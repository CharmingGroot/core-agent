/**
 * Factory for composing a PermissionHandler that integrates
 * Rule engine checks and Governance policy checks.
 *
 * This is the only place where @core/rule and @core/types (policy)
 * meet @cli-agent/agent's PermissionHandler — keeping packages decoupled.
 */
import type { IPolicyProvider } from '@core/types';
import type { RuleEngine } from '@core/rule';
import type { JsonObject } from '@cli-agent/core';
import type { PermissionHandler, ApprovalLevel } from '@cli-agent/agent';

export interface PermissionFactoryConfig {
  /** Policy provider (OpenPolicy for standalone, GovernedPolicy for governed) */
  readonly policy: IPolicyProvider;
  /** User ID for policy lookups */
  readonly userId: string;
  /** Rule engine for pre-execution checks (optional) */
  readonly ruleEngine?: RuleEngine;
  /** Session ID for rule context */
  readonly sessionId?: string;
  /**
   * Fallback handler for interactive approval (e.g., CLI y/n prompt).
   * Called when governance requires approval or when no policy decision is made.
   * If not provided, defaults to 'deny' for approval-required tools.
   */
  readonly interactiveHandler?: (
    toolName: string,
    params: JsonObject,
  ) => Promise<ApprovalLevel>;
}

/**
 * Creates a PermissionHandler that chains:
 *   1. Rule engine pre-check (if configured)
 *   2. Governance policy check (canUseTool + requiresApproval)
 *   3. Interactive fallback (CLI prompt, etc.)
 */
export function createPermissionHandler(
  config: PermissionFactoryConfig,
): PermissionHandler {
  const { policy, userId, ruleEngine, sessionId, interactiveHandler } = config;

  return async (toolName: string, params: JsonObject): Promise<ApprovalLevel> => {
    // 1. Rule engine pre-check
    if (ruleEngine) {
      const ruleResult = await ruleEngine.evaluatePre({
        toolName,
        toolParams: params,
        userId,
        sessionId: sessionId ?? 'unknown',
      });
      if (!ruleResult.allowed) {
        return 'deny';
      }
    }

    // 2. Governance policy — can this user use this tool at all?
    const canUse = await policy.canUseTool(userId, toolName);
    if (!canUse) {
      return 'deny';
    }

    // 3. Does governance require approval for this tool?
    const needsApproval = await policy.requiresApproval(userId, toolName);
    if (!needsApproval) {
      return 'session';
    }

    // 4. Interactive approval (CLI prompt, UI dialog, etc.)
    if (interactiveHandler) {
      return interactiveHandler(toolName, params);
    }

    // No interactive handler — deny by default for approval-required tools
    return 'deny';
  };
}
