import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { GovernancePanel } from '../src/renderer/components/governance/GovernancePanel.js';
import { GovernanceNav } from '../src/renderer/components/governance/GovernanceNav.js';
import { DomainPanel } from '../src/renderer/components/governance/DomainPanel.js';
import { SkillRulePanel } from '../src/renderer/components/governance/SkillRulePanel.js';
import { AuditLogPanel } from '../src/renderer/components/governance/AuditLogPanel.js';

beforeEach(() => {
  (globalThis as Record<string, unknown>)['window'] = {
    electronApi: {
      sendMessage: vi.fn(),
      abort: vi.fn(),
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      onAgentEvent: vi.fn(() => vi.fn()),
      onAgentResponse: vi.fn(() => vi.fn()),
      onAgentError: vi.fn(() => vi.fn()),
      onConfigValue: vi.fn(() => vi.fn()),
      govGetState: vi.fn(),
      govSetMode: vi.fn(),
      govAddDomain: vi.fn(),
      govRemoveDomain: vi.fn(),
      govToggleRule: vi.fn(),
      govClearAudit: vi.fn(),
      onGovState: vi.fn(() => vi.fn()),
    },
  };
});

describe('GovernancePanel', () => {
  it('should render governance panel', () => {
    const html = renderToString(<GovernancePanel onBack={vi.fn()} />);
    expect(html).toContain('Governance');
  });

  it('should show standalone mode by default', () => {
    const html = renderToString(<GovernancePanel onBack={vi.fn()} />);
    expect(html).toContain('Standalone');
    expect(html).toContain('Governed');
  });

  it('should show domain tab by default', () => {
    const html = renderToString(<GovernancePanel onBack={vi.fn()} />);
    expect(html).toContain('Domain Configuration');
  });

  it('should render all tabs', () => {
    const html = renderToString(<GovernancePanel onBack={vi.fn()} />);
    expect(html).toContain('Domains');
    expect(html).toContain('Skills &amp; Rules');
    expect(html).toContain('Audit Log');
  });
});

describe('GovernanceNav', () => {
  it('should render navigation with tabs', () => {
    const html = renderToString(
      <GovernanceNav
        activeTab="domains"
        policyMode="standalone"
        onTabChange={vi.fn()}
        onModeChange={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(html).toContain('Governance');
    expect(html).toContain('Domains');
    expect(html).toContain('Skills');
    expect(html).toContain('Audit Log');
  });

  it('should show mode switch buttons', () => {
    const html = renderToString(
      <GovernanceNav
        activeTab="domains"
        policyMode="governed"
        onTabChange={vi.fn()}
        onModeChange={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(html).toContain('Standalone');
    expect(html).toContain('Governed');
  });

  it('should render back button', () => {
    const html = renderToString(
      <GovernanceNav
        activeTab="domains"
        policyMode="standalone"
        onTabChange={vi.fn()}
        onModeChange={vi.fn()}
        onBack={vi.fn()}
      />
    );
    expect(html).toContain('Back');
  });
});

describe('DomainPanel', () => {
  it('should show empty message when no domains', () => {
    const html = renderToString(
      <DomainPanel domains={[]} onAdd={vi.fn()} onRemove={vi.fn()} />
    );
    expect(html).toContain('No domains configured');
  });

  it('should render domains list', () => {
    const domains = [
      { id: 'd1', name: 'Test Domain', description: 'A test', skills: ['code-review'], agents: ['agent-1'] },
    ];
    const html = renderToString(
      <DomainPanel domains={domains} onAdd={vi.fn()} onRemove={vi.fn()} />
    );
    expect(html).toContain('Test Domain');
    expect(html).toContain('A test');
    expect(html).toContain('code-review');
    expect(html).toContain('agent-1');
  });

  it('should render add domain button', () => {
    const html = renderToString(
      <DomainPanel domains={[]} onAdd={vi.fn()} onRemove={vi.fn()} />
    );
    expect(html).toContain('Add Domain');
  });

  it('should render remove button for each domain', () => {
    const domains = [
      { id: 'd1', name: 'Dom1', description: '', skills: [], agents: [] },
      { id: 'd2', name: 'Dom2', description: '', skills: [], agents: [] },
    ];
    const html = renderToString(
      <DomainPanel domains={domains} onAdd={vi.fn()} onRemove={vi.fn()} />
    );
    expect(html).toContain('Remove');
    expect(html).toContain('Dom1');
    expect(html).toContain('Dom2');
  });
});

describe('SkillRulePanel', () => {
  it('should show empty message when no skills', () => {
    const html = renderToString(
      <SkillRulePanel skills={[]} rules={[]} onToggleRule={vi.fn()} />
    );
    expect(html).toContain('No skills loaded');
  });

  it('should render skills', () => {
    const skills = [
      { name: 'code-review', description: 'Code review', tools: ['file_read'] },
    ];
    const html = renderToString(
      <SkillRulePanel skills={skills} rules={[]} onToggleRule={vi.fn()} />
    );
    expect(html).toContain('code-review');
    expect(html).toContain('Code review');
    expect(html).toContain('file_read');
  });

  it('should render rules table', () => {
    const rules = [
      { name: 'NoDestructiveCommand', phase: 'pre' as const, severity: 'block' as const, enabled: true },
      { name: 'AuditLog', phase: 'post' as const, severity: 'log' as const, enabled: false },
    ];
    const html = renderToString(
      <SkillRulePanel skills={[]} rules={rules} onToggleRule={vi.fn()} />
    );
    expect(html).toContain('NoDestructiveCommand');
    expect(html).toContain('AuditLog');
    expect(html).toContain('block');
    expect(html).toContain('log');
    expect(html).toContain('ON');
    expect(html).toContain('OFF');
  });

  it('should show rule phase badges', () => {
    const rules = [
      { name: 'TestRule', phase: 'pre' as const, severity: 'warn' as const, enabled: true },
    ];
    const html = renderToString(
      <SkillRulePanel skills={[]} rules={rules} onToggleRule={vi.fn()} />
    );
    expect(html).toContain('pre');
    expect(html).toContain('warn');
  });

  it('should render section titles', () => {
    const html = renderToString(
      <SkillRulePanel skills={[]} rules={[]} onToggleRule={vi.fn()} />
    );
    expect(html).toContain('Loaded Skills');
    expect(html).toContain('Rule Engine');
  });
});

describe('AuditLogPanel', () => {
  it('should show empty message when no entries', () => {
    const html = renderToString(
      <AuditLogPanel entries={[]} onClear={vi.fn()} />
    );
    expect(html).toContain('No audit entries');
  });

  it('should render audit entries', () => {
    const entries = [
      {
        timestamp: '2026-03-07T12:00:00Z',
        userId: 'admin',
        action: 'domain_create',
        decision: 'allowed' as const,
        details: 'Created domain: test',
      },
    ];
    const html = renderToString(
      <AuditLogPanel entries={entries} onClear={vi.fn()} />
    );
    expect(html).toContain('admin');
    expect(html).toContain('domain_create');
    expect(html).toContain('allowed');
    expect(html).toContain('Created domain: test');
  });

  it('should show entry count', () => {
    const entries = [
      { timestamp: '2026-03-07T12:00:00Z', userId: 'u1', action: 'a1', decision: 'allowed' as const },
      { timestamp: '2026-03-07T12:01:00Z', userId: 'u2', action: 'a2', decision: 'denied' as const },
    ];
    const html = renderToString(
      <AuditLogPanel entries={entries} onClear={vi.fn()} />
    );
    expect(html).toContain('entries');
    expect(html).toContain('2');
  });

  it('should render clear button', () => {
    const html = renderToString(
      <AuditLogPanel entries={[]} onClear={vi.fn()} />
    );
    expect(html).toContain('Clear');
  });

  it('should render tool name when present', () => {
    const entries = [
      {
        timestamp: '2026-03-07T12:00:00Z',
        userId: 'admin',
        action: 'rule_toggle',
        decision: 'allowed' as const,
        toolName: 'SandboxOnly',
      },
    ];
    const html = renderToString(
      <AuditLogPanel entries={entries} onClear={vi.fn()} />
    );
    expect(html).toContain('SandboxOnly');
  });

  it('should render different decision styles', () => {
    const entries = [
      { timestamp: '2026-03-07T12:00:00Z', userId: 'u1', action: 'a1', decision: 'allowed' as const },
      { timestamp: '2026-03-07T12:01:00Z', userId: 'u2', action: 'a2', decision: 'denied' as const },
      { timestamp: '2026-03-07T12:02:00Z', userId: 'u3', action: 'a3', decision: 'pending' as const },
    ];
    const html = renderToString(
      <AuditLogPanel entries={entries} onClear={vi.fn()} />
    );
    expect(html).toContain('allowed');
    expect(html).toContain('denied');
    expect(html).toContain('pending');
  });
});
