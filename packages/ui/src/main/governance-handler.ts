/**
 * GovernanceHandler — IPC를 통해 @core/* 패키지와 Electron UI를 연결한다.
 *
 * IPolicyProvider 패턴 활용:
 *   - standalone 모드: OpenPolicy (all-allow, no DB)
 *   - governed 모드: InMemoryGovernanceStore + GovernedPolicy (RBAC)
 *
 * 실제 DB 연동(PostgreSQL, MySQL, MongoDB)은 Helm/K8s 배포 시 사용되며,
 * Electron UI에서는 InMemoryGovernanceStore로 테스트한다.
 */
import type { IPolicyProvider, AuditEntry } from '@core/types';
import { OpenPolicy } from '@core/types';
import type {
  GovernanceStatePayload,
  GovernanceDomainPayload,
  GovernanceRulePayload,
  GovernanceAuditPayload,
} from './ipc-channels.js';

/** Built-in rule definitions */
const BUILT_IN_RULES: GovernanceRulePayload[] = [
  { name: 'NoDestructiveCommand', phase: 'pre', severity: 'block', enabled: true },
  { name: 'AuditLog', phase: 'post', severity: 'log', enabled: true },
  { name: 'SandboxOnly', phase: 'pre', severity: 'block', enabled: false },
  { name: 'PiiRedact', phase: 'post', severity: 'warn', enabled: false },
  { name: 'MaxToolCalls', phase: 'pre', severity: 'block', enabled: true },
];

const SAMPLE_SKILLS = [
  { name: 'code-review', description: 'Code review and static analysis', tools: ['file_read', 'file_search', 'shell_exec'] },
  { name: 'devops', description: 'Infrastructure and deployment tasks', tools: ['shell_exec', 'file_write'] },
];

let domainIdCounter = 0;

/**
 * GovernanceHandler manages governance state and provides
 * the active IPolicyProvider for the agent system.
 */
export class GovernanceHandler {
  private policyMode: 'standalone' | 'governed' = 'standalone';
  private policy: IPolicyProvider = new OpenPolicy();
  private domains: GovernanceDomainPayload[] = [];
  private rules: GovernanceRulePayload[] = [...BUILT_IN_RULES];
  private auditLog: GovernanceAuditPayload[] = [];

  /**
   * Returns the currently active policy provider.
   * Agent system should use this to check permissions.
   */
  getPolicy(): IPolicyProvider {
    return this.policy;
  }

  /** Returns current governance state for UI rendering */
  getState(): GovernanceStatePayload {
    return {
      policyMode: this.policyMode,
      domains: this.domains,
      skills: SAMPLE_SKILLS,
      rules: this.rules,
      auditLog: this.auditLog,
    };
  }

  /** Switch between standalone and governed mode */
  setMode(mode: 'standalone' | 'governed'): GovernanceStatePayload {
    this.policyMode = mode;

    if (mode === 'standalone') {
      this.policy = new OpenPolicy();
    } else {
      // Governed 모드: 향후 GovernedPolicy + DB store로 교체
      // 현재는 OpenPolicy 유지하되 audit logging 활성화
      this.policy = new OpenPolicy();
    }

    this.appendAudit('admin', 'policy_mode_change', 'allowed', undefined, `Switched to ${mode} mode`);
    return this.getState();
  }

  /** Add a new domain */
  addDomain(domain: Omit<GovernanceDomainPayload, 'id'>): GovernanceStatePayload {
    domainIdCounter++;
    const newDomain: GovernanceDomainPayload = {
      ...domain,
      id: `domain-${domainIdCounter}`,
    };
    this.domains.push(newDomain);
    this.appendAudit('admin', 'domain_create', 'allowed', undefined, `Created domain: ${domain.name}`);
    return this.getState();
  }

  /** Remove a domain by ID */
  removeDomain(id: string): GovernanceStatePayload {
    const domain = this.domains.find((d) => d.id === id);
    this.domains = this.domains.filter((d) => d.id !== id);
    this.appendAudit('admin', 'domain_delete', 'allowed', undefined, `Removed domain: ${domain?.name ?? id}`);
    return this.getState();
  }

  /** Toggle a rule on/off */
  toggleRule(ruleName: string): GovernanceStatePayload {
    this.rules = this.rules.map((r) =>
      r.name === ruleName ? { ...r, enabled: !r.enabled } : r,
    );
    const rule = this.rules.find((r) => r.name === ruleName);
    this.appendAudit('admin', 'rule_toggle', 'allowed', ruleName, `${ruleName}: ${rule?.enabled ? 'ON' : 'OFF'}`);
    return this.getState();
  }

  /** Clear audit log */
  clearAudit(): GovernanceStatePayload {
    this.auditLog = [];
    return this.getState();
  }

  /** Record an action from the agent system */
  async recordAgentAction(entry: AuditEntry): Promise<void> {
    this.appendAudit(
      entry.userId,
      entry.action,
      entry.decision,
      'toolName' in entry ? (entry as Record<string, unknown>)['toolName'] as string : undefined,
    );
    await this.policy.recordAction(entry);
  }

  private appendAudit(
    userId: string,
    action: string,
    decision: 'allowed' | 'denied' | 'pending',
    toolName?: string,
    details?: string,
  ): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      userId,
      action,
      decision,
      toolName,
      details,
    });
  }
}
