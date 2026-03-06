import { describe, it, expect, beforeEach } from 'vitest';
import { GovernanceHandler } from '../src/main/governance-handler.js';

describe('GovernanceHandler', () => {
  let handler: GovernanceHandler;

  beforeEach(() => {
    handler = new GovernanceHandler();
  });

  it('should start in standalone mode', () => {
    const state = handler.getState();
    expect(state.policyMode).toBe('standalone');
  });

  it('should return a valid policy provider', () => {
    const policy = handler.getPolicy();
    expect(policy).toBeDefined();
    expect(typeof policy.canUseSkill).toBe('function');
    expect(typeof policy.canUseTool).toBe('function');
  });

  it('should switch to governed mode', () => {
    const state = handler.setMode('governed');
    expect(state.policyMode).toBe('governed');
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].action).toBe('policy_mode_change');
  });

  it('should switch back to standalone mode', () => {
    handler.setMode('governed');
    const state = handler.setMode('standalone');
    expect(state.policyMode).toBe('standalone');
    expect(state.auditLog.length).toBe(2);
  });

  it('should add a domain', () => {
    const state = handler.addDomain({
      name: 'Test Domain',
      description: 'A test domain',
      skills: ['code-review'],
      agents: ['agent-1'],
    });
    expect(state.domains.length).toBe(1);
    expect(state.domains[0].name).toBe('Test Domain');
    expect(state.domains[0].id).toBeTruthy();
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].action).toBe('domain_create');
  });

  it('should remove a domain', () => {
    const afterAdd = handler.addDomain({
      name: 'To Remove',
      description: '',
      skills: [],
      agents: [],
    });
    const domainId = afterAdd.domains[0].id;
    const state = handler.removeDomain(domainId);
    expect(state.domains.length).toBe(0);
    expect(state.auditLog.length).toBe(2);
    expect(state.auditLog[1].action).toBe('domain_delete');
  });

  it('should toggle a rule', () => {
    const initial = handler.getState();
    const rulesBefore = initial.rules.find((r) => r.name === 'SandboxOnly');
    expect(rulesBefore?.enabled).toBe(false);

    const state = handler.toggleRule('SandboxOnly');
    const rulesAfter = state.rules.find((r) => r.name === 'SandboxOnly');
    expect(rulesAfter?.enabled).toBe(true);
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].action).toBe('rule_toggle');
  });

  it('should clear audit log', () => {
    handler.setMode('governed');
    handler.setMode('standalone');
    expect(handler.getState().auditLog.length).toBe(2);

    const state = handler.clearAudit();
    expect(state.auditLog.length).toBe(0);
  });

  it('should include built-in rules', () => {
    const state = handler.getState();
    const ruleNames = state.rules.map((r) => r.name);
    expect(ruleNames).toContain('NoDestructiveCommand');
    expect(ruleNames).toContain('AuditLog');
    expect(ruleNames).toContain('SandboxOnly');
    expect(ruleNames).toContain('PiiRedact');
    expect(ruleNames).toContain('MaxToolCalls');
  });

  it('should include sample skills', () => {
    const state = handler.getState();
    expect(state.skills.length).toBeGreaterThan(0);
    const skillNames = state.skills.map((s) => s.name);
    expect(skillNames).toContain('code-review');
    expect(skillNames).toContain('devops');
  });

  it('should have OpenPolicy in standalone mode that allows everything', async () => {
    const policy = handler.getPolicy();
    expect(await policy.canUseSkill('any-user', 'any-skill')).toBe(true);
    expect(await policy.canUseTool('any-user', 'any-tool')).toBe(true);
    expect(await policy.requiresApproval('any-user', 'any-tool')).toBe(false);
  });

  it('should accumulate audit entries across operations', () => {
    handler.setMode('governed');
    handler.addDomain({ name: 'D1', description: '', skills: [], agents: [] });
    handler.toggleRule('PiiRedact');

    const state = handler.getState();
    expect(state.auditLog.length).toBe(3);
    expect(state.auditLog[0].action).toBe('policy_mode_change');
    expect(state.auditLog[1].action).toBe('domain_create');
    expect(state.auditLog[2].action).toBe('rule_toggle');
  });
});
