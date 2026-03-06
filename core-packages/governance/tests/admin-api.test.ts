import { describe, it, expect, beforeEach } from 'vitest';
import { GovernanceAdmin } from '../src/admin-api.js';
import { InMemoryGovernanceStore } from '../src/stores/in-memory-store.js';
import { GovernedPolicy } from '../src/governed-policy.js';
import type { GovernancePolicy, RoleDefinition } from '@core/types';

const DEFAULT_POLICY: GovernancePolicy = {
  approvalRequired: ['deploy'],
  auditLevel: 'full',
  maxTokensPerRequest: 4096,
  maxToolCallsPerSession: 100,
  dataClassification: 'internal',
  allowedProviders: ['anthropic'],
  blockedCommands: [],
};

const DEV_ROLE: RoleDefinition = {
  name: 'developer',
  description: 'Developer role',
  allowedSkills: ['code-gen'],
  allowedTools: ['bash'],
  policy: DEFAULT_POLICY,
};

describe('GovernanceAdmin', () => {
  let store: InMemoryGovernanceStore;
  let admin: GovernanceAdmin;

  beforeEach(async () => {
    store = new InMemoryGovernanceStore();
    admin = new GovernanceAdmin(store);
    await store.createRole(DEV_ROLE);
  });

  it('should create a user', async () => {
    const user = await admin.createUser('u1', 'alice');
    expect(user.userId).toBe('u1');
    expect(user.username).toBe('alice');
    expect(user.roles).toHaveLength(0);

    const stored = await store.getUser('u1');
    expect(stored).toBeDefined();
  });

  it('should assign a role to a user', async () => {
    await admin.createUser('u1', 'alice');
    await admin.assignRole('u1', 'developer');

    const user = await store.getUser('u1');
    expect(user?.roles).toContain('developer');
  });

  it('should throw when assigning role to non-existent user', async () => {
    await expect(
      admin.assignRole('non-existent', 'developer'),
    ).rejects.toThrow('User not found');
  });

  it('should throw when assigning non-existent role', async () => {
    await admin.createUser('u1', 'alice');
    await expect(
      admin.assignRole('u1', 'non-existent'),
    ).rejects.toThrow('Role not found');
  });

  it('should revoke a role from a user', async () => {
    await admin.createUser('u1', 'alice');
    await admin.assignRole('u1', 'developer');
    await admin.revokeRole('u1', 'developer');

    const user = await store.getUser('u1');
    expect(user?.roles).not.toContain('developer');
  });

  it('should assign and revoke skills on a role', async () => {
    await admin.assignSkillToRole('developer', 'test-gen');
    let role = await store.getRole('developer');
    expect(role?.allowedSkills).toContain('test-gen');
    expect(role?.allowedSkills).toContain('code-gen');

    await admin.revokeSkillFromRole('developer', 'test-gen');
    role = await store.getRole('developer');
    expect(role?.allowedSkills).not.toContain('test-gen');
  });

  it('should assign and revoke tools on a role', async () => {
    await admin.assignToolToRole('developer', 'read-file');
    let role = await store.getRole('developer');
    expect(role?.allowedTools).toContain('read-file');

    await admin.revokeToolFromRole('developer', 'read-file');
    role = await store.getRole('developer');
    expect(role?.allowedTools).not.toContain('read-file');
  });

  it('should set policy on existing role', async () => {
    const newPolicy: GovernancePolicy = {
      ...DEFAULT_POLICY,
      auditLevel: 'none',
      maxTokensPerRequest: 8192,
    };

    await admin.setPolicy('developer', newPolicy);
    const role = await store.getRole('developer');
    expect(role?.policy.auditLevel).toBe('none');
    expect(role?.policy.maxTokensPerRequest).toBe(8192);
  });

  it('should create role when setting policy on non-existent role', async () => {
    await admin.setPolicy('new-role', DEFAULT_POLICY, 'New role');
    const role = await store.getRole('new-role');
    expect(role).toBeDefined();
    expect(role?.description).toBe('New role');
  });

  it('should generate audit report', async () => {
    await store.insertAuditLog({
      timestamp: new Date('2026-01-15T10:00:00Z'),
      runId: 'run-1',
      agentId: 'agent-1',
      userId: 'u1',
      action: 'tool_call',
      toolName: 'bash',
      decision: 'allowed',
    });
    await store.insertAuditLog({
      timestamp: new Date('2026-01-15T11:00:00Z'),
      runId: 'run-2',
      agentId: 'agent-1',
      userId: 'u1',
      action: 'skill_load',
      decision: 'allowed',
    });

    const report = await admin.getAuditReport({ userId: 'u1' });
    expect(report.totalEntries).toBe(2);
    expect(report.entries).toHaveLength(2);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it('should integrate admin operations with GovernedPolicy', async () => {
    const policy = new GovernedPolicy(store);

    await admin.createUser('u1', 'alice');
    await admin.assignRole('u1', 'developer');

    expect(await policy.canUseSkill('u1', 'code-gen')).toBe(true);
    expect(await policy.canUseTool('u1', 'bash')).toBe(true);
    expect(await policy.requiresApproval('u1', 'deploy')).toBe(true);

    await admin.assignSkillToRole('developer', 'deploy-skill');
    const skills = await policy.getAllowedSkills('u1');
    expect(skills).toContain('deploy-skill');
  });
});
