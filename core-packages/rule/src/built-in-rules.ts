import type {
  IRule,
  RuleContext,
  RuleResult,
  RulePhase,
  RuleSeverity,
  IPolicyProvider,
} from '@core/types';

/**
 * Patterns considered destructive in shell commands.
 */
const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\brm\s+-fr\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b:\s*>\s*\//,
  /\bgit\s+push\s+.*--force\b/i,
  /\bchmod\s+-R\s+777\b/i,
];

/**
 * Blocks shell commands containing destructive patterns like rm -rf, DROP TABLE, etc.
 */
export class NoDestructiveCommandRule implements IRule {
  readonly name = 'no-destructive-command';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description =
    'Blocks shell commands containing destructive patterns (rm -rf, DROP TABLE, etc.)';

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const command = this.extractCommand(context);
    if (command === undefined) {
      return { allowed: true };
    }

    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Destructive command detected: matches pattern ${pattern.source}`,
        };
      }
    }

    return { allowed: true };
  }

  private extractCommand(context: RuleContext): string | undefined {
    const { toolParams } = context;
    if (typeof toolParams['command'] === 'string') {
      return toolParams['command'];
    }
    if (typeof toolParams['input'] === 'string') {
      return toolParams['input'];
    }
    return undefined;
  }
}

/**
 * Logs all tool executions to the policy provider as audit entries.
 */
export class AuditLogRule implements IRule {
  readonly name = 'audit-log';
  readonly phase: RulePhase = 'post';
  readonly severity: RuleSeverity = 'log';
  readonly description = 'Logs all tool executions to the policy provider for auditing';

  private readonly policyProvider: IPolicyProvider;

  constructor(policyProvider: IPolicyProvider) {
    this.policyProvider = policyProvider;
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    await this.policyProvider.recordAction({
      timestamp: new Date(),
      runId: typeof context.metadata['runId'] === 'string' ? context.metadata['runId'] : 'unknown',
      agentId: context.agentId,
      domainId: context.domainId,
      userId: context.userId,
      action: 'tool_call',
      toolName: context.toolName,
      skillName: context.skillName,
      input: context.toolParams,
      output: context.toolResult
        ? { success: context.toolResult.success, output: context.toolResult.output }
        : undefined,
      decision: 'allowed',
      durationMs: context.toolResult?.durationMs,
    });

    return { allowed: true };
  }
}

/**
 * Blocks shell_exec tool calls when the command targets paths outside the sandbox.
 */
export class SandboxOnlyRule implements IRule {
  readonly name = 'sandbox-only';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description = 'Blocks shell execution outside the designated sandbox directory';

  private readonly sandboxPath: string;

  constructor(sandboxPath: string) {
    this.sandboxPath = sandboxPath;
  }

  async evaluate(context: RuleContext): Promise<RuleResult> {
    if (context.toolName !== 'shell_exec') {
      return { allowed: true };
    }

    const command = typeof context.toolParams['command'] === 'string'
      ? context.toolParams['command']
      : undefined;

    if (command === undefined) {
      return { allowed: true };
    }

    const cwd = typeof context.toolParams['cwd'] === 'string'
      ? context.toolParams['cwd']
      : undefined;

    if (cwd !== undefined && !cwd.startsWith(this.sandboxPath)) {
      return {
        allowed: false,
        reason: `Working directory "${cwd}" is outside sandbox "${this.sandboxPath}"`,
      };
    }

    return { allowed: true };
  }
}

/**
 * Regex patterns for common PII types.
 */
const PII_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ['email', /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
  ['phone', /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
]);

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Redacts PII patterns (email, phone, SSN) from tool output.
 */
export class PiiRedactRule implements IRule {
  readonly name = 'pii-redact';
  readonly phase: RulePhase = 'post';
  readonly severity: RuleSeverity = 'warn';
  readonly description = 'Redacts PII patterns (email, phone, SSN) from tool output';

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const output = context.toolResult?.output;
    if (output === undefined || output.length === 0) {
      return { allowed: true };
    }

    let redacted = output;
    let piiFound = false;

    for (const [, pattern] of PII_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(redacted)) {
        piiFound = true;
        redacted = redacted.replace(
          new RegExp(pattern.source, pattern.flags),
          REDACTED_PLACEHOLDER,
        );
      }
    }

    if (piiFound) {
      return {
        allowed: false,
        reason: 'PII detected and redacted from output',
        filteredOutput: redacted,
      };
    }

    return { allowed: true };
  }
}

/**
 * Blocks tool execution after exceeding a maximum number of calls per session.
 */
export class MaxToolCallsRule implements IRule {
  readonly name = 'max-tool-calls';
  readonly phase: RulePhase = 'pre';
  readonly severity: RuleSeverity = 'block';
  readonly description = 'Blocks tool execution after exceeding the maximum allowed calls';

  private readonly maxCalls: number;
  private callCount = 0;

  constructor(maxCalls: number) {
    this.maxCalls = maxCalls;
  }

  async evaluate(_context: RuleContext): Promise<RuleResult> {
    this.callCount += 1;

    if (this.callCount > this.maxCalls) {
      return {
        allowed: false,
        reason: `Maximum tool calls exceeded: ${this.callCount}/${this.maxCalls}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Reset the call counter (useful for testing or session reset).
   */
  resetCount(): void {
    this.callCount = 0;
  }
}
