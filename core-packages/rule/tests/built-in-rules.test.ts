import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NoDestructiveCommandRule,
  AuditLogRule,
  SandboxOnlyRule,
  PiiRedactRule,
  MaxToolCallsRule,
} from '../src/built-in-rules.js';
import type { RuleContext, IPolicyProvider, AuditEntry } from '@core/types';

function createContext(overrides?: Partial<RuleContext>): RuleContext {
  return {
    agentId: 'agent-1',
    skillName: 'test-skill',
    toolName: 'shell_exec',
    toolParams: {},
    userId: 'user-1',
    metadata: {},
    ...overrides,
  };
}

function createMockPolicyProvider(): IPolicyProvider {
  return {
    canUseSkill: vi.fn().mockResolvedValue(true),
    canUseTool: vi.fn().mockResolvedValue(true),
    requiresApproval: vi.fn().mockResolvedValue(false),
    requestApproval: vi.fn().mockResolvedValue({
      status: 'approved' as const,
      timestamp: new Date(),
    }),
    recordAction: vi.fn().mockResolvedValue(undefined),
    getAllowedSkills: vi.fn().mockResolvedValue([]),
    getAllowedTools: vi.fn().mockResolvedValue([]),
  };
}

describe('NoDestructiveCommandRule', () => {
  let rule: NoDestructiveCommandRule;

  beforeEach(() => {
    rule = new NoDestructiveCommandRule();
  });

  it('should have correct metadata', () => {
    expect(rule.name).toBe('no-destructive-command');
    expect(rule.phase).toBe('pre');
    expect(rule.severity).toBe('block');
  });

  it('should block rm -rf commands', async () => {
    const ctx = createContext({ toolParams: { command: 'rm -rf /tmp/data' } });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Destructive command detected');
  });

  it('should block DROP TABLE commands', async () => {
    const ctx = createContext({
      toolParams: { command: 'psql -c "DROP TABLE users;"' },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
  });

  it('should allow safe commands', async () => {
    const ctx = createContext({ toolParams: { command: 'ls -la /home' } });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });

  it('should allow when no command param is present', async () => {
    const ctx = createContext({ toolParams: { path: '/some/file' } });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

describe('AuditLogRule', () => {
  it('should call recordAction on the policy provider', async () => {
    const provider = createMockPolicyProvider();
    const rule = new AuditLogRule(provider);

    const ctx = createContext({
      toolParams: { command: 'echo test' },
      toolResult: { success: true, output: 'test', durationMs: 50 },
      metadata: { runId: 'run-123' },
    });

    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
    expect(provider.recordAction).toHaveBeenCalledOnce();

    const entry = (provider.recordAction as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as AuditEntry;
    expect(entry.action).toBe('tool_call');
    expect(entry.agentId).toBe('agent-1');
    expect(entry.runId).toBe('run-123');
    expect(entry.toolName).toBe('shell_exec');
  });
});

describe('SandboxOnlyRule', () => {
  let rule: SandboxOnlyRule;

  beforeEach(() => {
    rule = new SandboxOnlyRule('/sandbox');
  });

  it('should allow commands within the sandbox', async () => {
    const ctx = createContext({
      toolParams: { command: 'ls', cwd: '/sandbox/project' },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });

  it('should block commands outside the sandbox', async () => {
    const ctx = createContext({
      toolParams: { command: 'ls', cwd: '/etc/secrets' },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('outside sandbox');
  });

  it('should allow non-shell_exec tools without checking', async () => {
    const ctx = createContext({
      toolName: 'file_read',
      toolParams: { path: '/etc/passwd' },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

describe('PiiRedactRule', () => {
  let rule: PiiRedactRule;

  beforeEach(() => {
    rule = new PiiRedactRule();
  });

  it('should redact email addresses from output', async () => {
    const ctx = createContext({
      toolResult: {
        success: true,
        output: 'Contact: john@example.com for info',
        durationMs: 10,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.filteredOutput).toContain('[REDACTED]');
    expect(result.filteredOutput).not.toContain('john@example.com');
  });

  it('should redact phone numbers from output', async () => {
    const ctx = createContext({
      toolResult: {
        success: true,
        output: 'Call us at 123-456-7890',
        durationMs: 10,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(false);
    expect(result.filteredOutput).toContain('[REDACTED]');
    expect(result.filteredOutput).not.toContain('123-456-7890');
  });

  it('should allow output without PII', async () => {
    const ctx = createContext({
      toolResult: {
        success: true,
        output: 'Hello world, no secrets here.',
        durationMs: 10,
      },
    });
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
    expect(result.filteredOutput).toBeUndefined();
  });

  it('should handle missing tool result gracefully', async () => {
    const ctx = createContext();
    const result = await rule.evaluate(ctx);
    expect(result.allowed).toBe(true);
  });
});

describe('MaxToolCallsRule', () => {
  it('should allow calls within the limit', async () => {
    const rule = new MaxToolCallsRule(3);
    const ctx = createContext();

    const r1 = await rule.evaluate(ctx);
    const r2 = await rule.evaluate(ctx);
    const r3 = await rule.evaluate(ctx);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('should block after exceeding the limit', async () => {
    const rule = new MaxToolCallsRule(2);
    const ctx = createContext();

    await rule.evaluate(ctx); // 1
    await rule.evaluate(ctx); // 2
    const r3 = await rule.evaluate(ctx); // 3 -> blocked

    expect(r3.allowed).toBe(false);
    expect(r3.reason).toContain('Maximum tool calls exceeded');
    expect(r3.reason).toContain('3/2');
  });

  it('should allow again after resetCount()', async () => {
    const rule = new MaxToolCallsRule(1);
    const ctx = createContext();

    await rule.evaluate(ctx); // 1 -> allowed
    const blocked = await rule.evaluate(ctx); // 2 -> blocked
    expect(blocked.allowed).toBe(false);

    rule.resetCount();
    const afterReset = await rule.evaluate(ctx); // 1 -> allowed
    expect(afterReset.allowed).toBe(true);
  });
});
