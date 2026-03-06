import type {
  IRule,
  RuleContext,
  RuleResult,
  RulePhase,
  RuleSeverity,
  IPolicyProvider,
} from '@core/types';

/**
 * Default tools that require admin approval before execution.
 */
const DEFAULT_APPROVAL_TOOLS: readonly string[] = ['file_write', 'shell_exec'];

/**
 * Requires admin approval before executing write/exec tools.
 * Checks against a configurable list of tool names that need approval.
 * Uses IPolicyProvider.requiresApproval() and requestApproval() for the workflow.
 */
export class RequireApprovalRule implements IRule {
  readonly name = 'require-approval';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description =
    'Requires admin approval before executing tools in the approval-required list';

  private readonly policyProvider: IPolicyProvider;
  private readonly approvalTools: readonly string[];

  constructor(policyProvider: IPolicyProvider, approvalTools?: string[]) {
    this.policyProvider = policyProvider;
    this.approvalTools = approvalTools ?? DEFAULT_APPROVAL_TOOLS;
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    if (!this.approvalTools.includes(context.toolName)) {
      return { allowed: true };
    }

    const needsApproval = await this.policyProvider.requiresApproval(
      context.userId,
      context.toolName,
    );

    if (!needsApproval) {
      return { allowed: true };
    }

    const result = await this.policyProvider.requestApproval({
      userId: context.userId,
      action: 'tool_call',
      toolName: context.toolName,
      params: context.toolParams,
    });

    if (result.status === 'approved') {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Approval denied for tool "${context.toolName}": ${result.reason ?? result.status}`,
    };
  }
}

/**
 * Tracking entry for rate limiting per user.
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Default rate limit window in milliseconds (1 minute).
 */
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Limits tool calls per user within a configurable time window.
 * Tracks calls per userId and resets the counter when the window expires.
 */
export class RateLimiterRule implements IRule {
  readonly name = 'rate-limiter';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description =
    'Limits tool calls per user within a configurable time window';

  private readonly maxCalls: number;
  private readonly windowMs: number;
  private readonly tracker: Map<string, RateLimitEntry> = new Map();

  constructor(maxCalls: number, windowMs: number = DEFAULT_WINDOW_MS) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const now = Date.now();
    const entry = this.tracker.get(context.userId);

    if (entry === undefined || now - entry.windowStart >= this.windowMs) {
      this.tracker.set(context.userId, { count: 1, windowStart: now });
      return { allowed: true };
    }

    entry.count += 1;

    if (entry.count > this.maxCalls) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for user "${context.userId}": ${entry.count}/${this.maxCalls} calls in ${this.windowMs}ms window`,
      };
    }

    return { allowed: true };
  }

  /**
   * Reset all tracking entries. Useful for testing.
   */
  resetAll(): void {
    this.tracker.clear();
  }
}

/**
 * Ensures users can only use tools assigned to their domain.
 * Enforces domain-level tool isolation in multi-domain environments.
 */
export class DomainScopeRule implements IRule {
  readonly name = 'domain-scope';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description =
    'Enforces domain-level tool isolation — users can only use tools assigned to their domain';

  private readonly domainToolMap: Map<string, string[]>;

  constructor(domainToolMap: Map<string, string[]>) {
    this.domainToolMap = domainToolMap;
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    if (context.domainId === undefined) {
      return { allowed: true };
    }

    const allowedTools = this.domainToolMap.get(context.domainId);

    if (allowedTools === undefined) {
      return { allowed: true };
    }

    if (!allowedTools.includes(context.toolName)) {
      return {
        allowed: false,
        reason: `Tool "${context.toolName}" is not allowed in domain "${context.domainId}"`,
      };
    }

    return { allowed: true };
  }
}

/**
 * Automatically triggers a reflection warning after code-edit or file-write operations.
 * This is a soft nudge (warn severity) — it does not block execution.
 */
export class ReflectAfterEditRule implements IRule {
  readonly name = 'reflect-after-edit';
  readonly phase: RulePhase = 'post';
  readonly severity: RuleSeverity = 'warn';
  readonly description =
    'Recommends reflection after code-edit or file-write operations to verify changes follow guidelines';

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const isFileWrite = context.toolName === 'file_write';
    const isCodeEdit = context.skillName === 'code-edit';

    if (!isFileWrite && !isCodeEdit) {
      return { allowed: true };
    }

    const detectedSkill = isCodeEdit ? context.skillName : context.toolName;

    return {
      allowed: true,
      reason: `Reflection recommended: call the reflect tool with skillName='${detectedSkill}' to verify your changes follow guidelines`,
    };
  }
}

/**
 * Prevents cross-session data leakage in multi-tenant environments.
 * Blocks execution when a session ID is present but not in the allowed set.
 */
export class SessionIsolationRule implements IRule {
  readonly name = 'session-isolation';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description =
    'Prevents cross-session data leakage by validating session IDs against an allowed set';

  private readonly allowedSessions: Set<string>;

  constructor(allowedSessions: Set<string>) {
    this.allowedSessions = allowedSessions;
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const sessionId = context.metadata['sessionId'];

    if (typeof sessionId !== 'string') {
      return { allowed: true };
    }

    if (!this.allowedSessions.has(sessionId)) {
      return {
        allowed: false,
        reason: `Session "${sessionId}" is not in the allowed sessions set`,
      };
    }

    return { allowed: true };
  }
}

/**
 * Options for configuring the governed rules factory.
 */
export interface GovernedRulesOptions {
  approvalTools?: string[];
  rateLimit?: number;
  rateLimitWindowMs?: number;
  domainToolMap?: Map<string, string[]>;
  allowedSessions?: Set<string>;
}

/**
 * Factory function that creates all governed-mode rules with sensible defaults.
 */
export function createGovernedRules(
  policy: IPolicyProvider,
  options?: GovernedRulesOptions,
): IRule[] {
  return [
    new RequireApprovalRule(policy, options?.approvalTools),
    new RateLimiterRule(options?.rateLimit ?? 100, options?.rateLimitWindowMs),
    new DomainScopeRule(options?.domainToolMap ?? new Map()),
    new ReflectAfterEditRule(),
    new SessionIsolationRule(options?.allowedSessions ?? new Set()),
  ];
}
