/**
 * Scenario tests for @core/governance package.
 * Covers RBAC lifecycle, GovernedPolicy, multi-role merging,
 * admin tool/skill management, approval workflow, audit log, and OpenPolicy comparison.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import type {
  GovernancePolicy,
  RoleDefinition,
  AuditEntry,
} from '@core/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makePolicy(overrides?: Partial<GovernancePolicy>): GovernancePolicy {
  return {
    approvalRequired: [],
    auditLevel: 'basic',
    maxTokensPerRequest: 4096,
    maxToolCallsPerSession: 100,
    dataClassification: 'internal',
    allowedProviders: ['*'],
    blockedCommands: [],
    ...overrides,
  };
}

function makeAuditEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  return {
    timestamp: new Date(),
    runId: 'run-1',
    agentId: 'agent-1',
    userId: 'user-1',
    action: 'tool_call',
    decision: 'allowed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Full RBAC Lifecycle
// ---------------------------------------------------------------------------
describe('Full RBAC Lifecycle', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];

  beforeEach(async () => {
    const mod = await import('@core/governance');
    InMemoryGovernanceStore = mod.InMemoryGovernanceStore;
  });

  it('should create user, create role, assign role, and verify', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    await store.createUser({
      userId: 'u1',
      username: 'alice',
      roles: [],
      domainIds: [],
    });

    const role: RoleDefinition = {
      name: 'developer',
      description: 'Dev role',
      allowedSkills: ['search'],
      allowedTools: ['file_read'],
      policy: makePolicy(),
    };
    await store.createRole(role);
    await store.assignRole('u1', 'developer');

    const user = await store.getUser('u1');
    expect(user).toBeDefined();
    expect(user!.roles).toContain('developer');
  });

  it('should revoke role and verify user no longer has it', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.createRole({
      name: 'developer',
      description: 'Dev role',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy(),
    });
    await store.assignRole('u1', 'developer');
    await store.revokeRole('u1', 'developer');

    const user = await store.getUser('u1');
    expect(user!.roles).not.toContain('developer');
  });

  it('should delete user and getUser returns undefined', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.deleteUser('u1');

    const user = await store.getUser('u1');
    expect(user).toBeUndefined();
  });

  it('should delete role and getRole returns undefined', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    await store.createRole({
      name: 'admin',
      description: 'Admin role',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy(),
    });
    await store.deleteRole('admin');

    const role = await store.getRole('admin');
    expect(role).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. GovernedPolicy - Permission Checks
// ---------------------------------------------------------------------------
describe('GovernedPolicy - Permission Checks', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let GovernedPolicy: Awaited<typeof import('@core/governance')>['GovernedPolicy'];

  beforeEach(async () => {
    const mod = await import('@core/governance');
    InMemoryGovernanceStore = mod.InMemoryGovernanceStore;
    GovernedPolicy = mod.GovernedPolicy;
  });

  it('should return false for canUseTool when user has no roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    const policy = new GovernedPolicy(store);
    expect(await policy.canUseTool('u1', 'file_read')).toBe(false);
  });

  it('should allow tools listed in role and deny unlisted tools', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: ['file_read', 'shell_exec'],
      policy: makePolicy(),
    });
    await store.assignRole('u1', 'dev');

    const policy = new GovernedPolicy(store);
    expect(await policy.canUseTool('u1', 'file_read')).toBe(true);
    expect(await policy.canUseTool('u1', 'shell_exec')).toBe(true);
    expect(await policy.canUseTool('u1', 'db_drop')).toBe(false);
  });

  it('should allow any tool when role has wildcard "*"', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.createRole({
      name: 'superadmin',
      description: 'Super admin',
      allowedSkills: [],
      allowedTools: ['*'],
      policy: makePolicy(),
    });
    await store.assignRole('u1', 'superadmin');

    const policy = new GovernedPolicy(store);
    expect(await policy.canUseTool('u1', 'anything')).toBe(true);
    expect(await policy.canUseTool('u1', 'random_tool_xyz')).toBe(true);
  });

  it('should check requiresApproval based on policy.approvalRequired', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: ['file_read', 'shell_exec'],
      policy: makePolicy({ approvalRequired: ['shell_exec'] }),
    });
    await store.assignRole('u1', 'dev');

    const policy = new GovernedPolicy(store);
    expect(await policy.requiresApproval('u1', 'shell_exec')).toBe(true);
    expect(await policy.requiresApproval('u1', 'file_read')).toBe(false);
  });

  it('should check canUseSkill following the same pattern as canUseTool', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: ['search', 'code'],
      allowedTools: [],
      policy: makePolicy(),
    });
    await store.assignRole('u1', 'dev');

    const policy = new GovernedPolicy(store);
    expect(await policy.canUseSkill('u1', 'search')).toBe(true);
    expect(await policy.canUseSkill('u1', 'code')).toBe(true);
    expect(await policy.canUseSkill('u1', 'deploy')).toBe(false);
  });

  it('should return false for canUseSkill when user has no roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    const policy = new GovernedPolicy(store);
    expect(await policy.canUseSkill('u1', 'anything')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Multi-Role Profile Merging
// ---------------------------------------------------------------------------
describe('Multi-Role Profile Merging', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let GovernedPolicy: Awaited<typeof import('@core/governance')>['GovernedPolicy'];

  beforeEach(async () => {
    const mod = await import('@core/governance');
    InMemoryGovernanceStore = mod.InMemoryGovernanceStore;
    GovernedPolicy = mod.GovernedPolicy;
  });

  it('should merge allowedTools and allowedSkills from multiple roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    await store.createRole({
      name: 'role-a',
      description: 'Role A',
      allowedSkills: ['search'],
      allowedTools: ['file_read'],
      policy: makePolicy({ auditLevel: 'basic', dataClassification: 'internal' }),
    });
    await store.createRole({
      name: 'role-b',
      description: 'Role B',
      allowedSkills: ['code'],
      allowedTools: ['shell_exec'],
      policy: makePolicy({ auditLevel: 'full', dataClassification: 'confidential' }),
    });

    await store.assignRole('u1', 'role-a');
    await store.assignRole('u1', 'role-b');

    const policy = new GovernedPolicy(store);
    const profile = await policy.getProfile('u1');

    expect(profile).not.toBeNull();
    expect(profile!.allowedTools).toEqual(expect.arrayContaining(['file_read', 'shell_exec']));
    expect(profile!.allowedSkills).toEqual(expect.arrayContaining(['search', 'code']));
  });

  it('should take union of approvalRequired from all roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    await store.createRole({
      name: 'role-a',
      description: 'Role A',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ approvalRequired: ['shell_exec'] }),
    });
    await store.createRole({
      name: 'role-b',
      description: 'Role B',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ approvalRequired: ['db_drop'] }),
    });

    await store.assignRole('u1', 'role-a');
    await store.assignRole('u1', 'role-b');

    const policy = new GovernedPolicy(store);
    const profile = await policy.getProfile('u1');

    expect(profile).not.toBeNull();
    expect(profile!.approvalRequired).toEqual(expect.arrayContaining(['shell_exec', 'db_drop']));
  });

  it('should take highest auditLevel across roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    await store.createRole({
      name: 'role-a',
      description: 'Role A',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ auditLevel: 'basic' }),
    });
    await store.createRole({
      name: 'role-b',
      description: 'Role B',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ auditLevel: 'full' }),
    });

    await store.assignRole('u1', 'role-a');
    await store.assignRole('u1', 'role-b');

    const policy = new GovernedPolicy(store);
    const profile = await policy.getProfile('u1');

    expect(profile!.policy.auditLevel).toBe('full');
  });

  it('should take most restrictive dataClassification across roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    await store.createRole({
      name: 'role-a',
      description: 'Role A',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ dataClassification: 'internal' }),
    });
    await store.createRole({
      name: 'role-b',
      description: 'Role B',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ dataClassification: 'restricted' }),
    });

    await store.assignRole('u1', 'role-a');
    await store.assignRole('u1', 'role-b');

    const policy = new GovernedPolicy(store);
    const profile = await policy.getProfile('u1');

    expect(profile!.policy.dataClassification).toBe('restricted');
  });

  it('should take highest maxToolCallsPerSession across roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    await store.createRole({
      name: 'role-a',
      description: 'Role A',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ maxToolCallsPerSession: 50 }),
    });
    await store.createRole({
      name: 'role-b',
      description: 'Role B',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ maxToolCallsPerSession: 200 }),
    });

    await store.assignRole('u1', 'role-a');
    await store.assignRole('u1', 'role-b');

    const policy = new GovernedPolicy(store);
    const profile = await policy.getProfile('u1');

    expect(profile!.policy.maxToolCallsPerSession).toBe(200);
  });

  it('should take union of allowedProviders across roles', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    await store.createRole({
      name: 'role-a',
      description: 'Role A',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ allowedProviders: ['openai'] }),
    });
    await store.createRole({
      name: 'role-b',
      description: 'Role B',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy({ allowedProviders: ['anthropic'] }),
    });

    await store.assignRole('u1', 'role-a');
    await store.assignRole('u1', 'role-b');

    const policy = new GovernedPolicy(store);
    const profile = await policy.getProfile('u1');

    expect(profile!.policy.allowedProviders).toEqual(
      expect.arrayContaining(['openai', 'anthropic']),
    );
  });
});

// ---------------------------------------------------------------------------
// 4. GovernanceAdmin - Role Tool/Skill Management
// ---------------------------------------------------------------------------
describe('GovernanceAdmin - Role Tool/Skill Management', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let GovernanceAdmin: Awaited<typeof import('@core/governance')>['GovernanceAdmin'];

  beforeEach(async () => {
    const mod = await import('@core/governance');
    InMemoryGovernanceStore = mod.InMemoryGovernanceStore;
    GovernanceAdmin = mod.GovernanceAdmin;
  });

  it('should add tool to role and not duplicate on second call', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy(),
    });

    const admin = new GovernanceAdmin(store);
    await admin.assignToolToRole('dev', 'file_read');
    await admin.assignToolToRole('dev', 'file_read');

    const role = await store.getRole('dev');
    expect(role!.allowedTools.filter((t) => t === 'file_read')).toHaveLength(1);
  });

  it('should remove tool from role via revokeToolFromRole', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: ['file_read', 'shell_exec'],
      policy: makePolicy(),
    });

    const admin = new GovernanceAdmin(store);
    await admin.revokeToolFromRole('dev', 'file_read');

    const role = await store.getRole('dev');
    expect(role!.allowedTools).not.toContain('file_read');
    expect(role!.allowedTools).toContain('shell_exec');
  });

  it('should add skill to role and not duplicate on second call', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy(),
    });

    const admin = new GovernanceAdmin(store);
    await admin.assignSkillToRole('dev', 'search');
    await admin.assignSkillToRole('dev', 'search');

    const role = await store.getRole('dev');
    expect(role!.allowedSkills.filter((s) => s === 'search')).toHaveLength(1);
  });

  it('should remove skill from role via revokeSkillFromRole', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: ['search', 'code'],
      allowedTools: [],
      policy: makePolicy(),
    });

    const admin = new GovernanceAdmin(store);
    await admin.revokeSkillFromRole('dev', 'search');

    const role = await store.getRole('dev');
    expect(role!.allowedSkills).not.toContain('search');
    expect(role!.allowedSkills).toContain('code');
  });

  it('should throw when assigning role to non-existent user', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: [],
      policy: makePolicy(),
    });

    const admin = new GovernanceAdmin(store);
    await expect(admin.assignRole('ghost-user', 'dev')).rejects.toThrow('User not found');
  });

  it('should throw when assigning non-existent role to user', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    const admin = new GovernanceAdmin(store);
    await expect(admin.assignRole('u1', 'ghost-role')).rejects.toThrow('Role not found');
  });
});

// ---------------------------------------------------------------------------
// 5. Approval Workflow
// ---------------------------------------------------------------------------
describe('Approval Workflow', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let GovernedPolicy: Awaited<typeof import('@core/governance')>['GovernedPolicy'];

  beforeEach(async () => {
    const mod = await import('@core/governance');
    InMemoryGovernanceStore = mod.InMemoryGovernanceStore;
    GovernedPolicy = mod.GovernedPolicy;
  });

  it('should create pending approval via requestApproval', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);
    const result = await policy.requestApproval({
      userId: 'u1',
      action: 'tool_call',
      toolName: 'shell_exec',
      params: { command: 'rm -rf /' },
      reason: 'Need to clean up',
    });

    expect(result.status).toBe('pending');

    const pending = await store.getPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('shell_exec');
    expect(pending[0].userId).toBe('u1');
  });

  it('should remove from pending after approval', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);
    await policy.requestApproval({
      userId: 'u1',
      action: 'tool_call',
      toolName: 'shell_exec',
      params: {},
    });

    const pendingBefore = await store.getPendingApprovals();
    expect(pendingBefore).toHaveLength(1);

    const approvalId = pendingBefore[0].id;
    await store.updateApprovalStatus(approvalId, 'approved', 'admin-1', 'Looks safe');

    const pendingAfter = await store.getPendingApprovals();
    expect(pendingAfter).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Audit Log
// ---------------------------------------------------------------------------
describe('Audit Log', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let GovernedPolicy: Awaited<typeof import('@core/governance')>['GovernedPolicy'];
  let GovernanceAdmin: Awaited<typeof import('@core/governance')>['GovernanceAdmin'];

  beforeEach(async () => {
    const mod = await import('@core/governance');
    InMemoryGovernanceStore = mod.InMemoryGovernanceStore;
    GovernedPolicy = mod.GovernedPolicy;
    GovernanceAdmin = mod.GovernanceAdmin;
  });

  it('should insert entries via recordAction and query all', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);
    await policy.recordAction(makeAuditEntry({ userId: 'u1', toolName: 'file_read' }));
    await policy.recordAction(makeAuditEntry({ userId: 'u2', toolName: 'shell_exec' }));
    await policy.recordAction(makeAuditEntry({ userId: 'u1', toolName: 'db_query' }));

    const all = await store.queryAuditLogs({});
    expect(all).toHaveLength(3);
  });

  it('should filter audit logs by userId', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);
    await policy.recordAction(makeAuditEntry({ userId: 'u1', toolName: 'file_read' }));
    await policy.recordAction(makeAuditEntry({ userId: 'u2', toolName: 'shell_exec' }));
    await policy.recordAction(makeAuditEntry({ userId: 'u1', toolName: 'db_query' }));

    const filtered = await store.queryAuditLogs({ userId: 'u1' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.userId === 'u1')).toBe(true);
  });

  it('should filter audit logs by date range (from/to)', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);

    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-06-15T00:00:00Z');
    const t3 = new Date('2026-12-31T00:00:00Z');

    await policy.recordAction(makeAuditEntry({ timestamp: t1, userId: 'u1' }));
    await policy.recordAction(makeAuditEntry({ timestamp: t2, userId: 'u1' }));
    await policy.recordAction(makeAuditEntry({ timestamp: t3, userId: 'u1' }));

    const filtered = await store.queryAuditLogs({
      from: new Date('2026-03-01T00:00:00Z'),
      to: new Date('2026-09-01T00:00:00Z'),
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].timestamp).toEqual(t2);
  });

  it('should support limit and offset for pagination', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);
    for (let i = 0; i < 10; i++) {
      await policy.recordAction(
        makeAuditEntry({ userId: 'u1', toolName: `tool-${i}` }),
      );
    }

    const page1 = await store.queryAuditLogs({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = await store.queryAuditLogs({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);

    const page4 = await store.queryAuditLogs({ limit: 3, offset: 9 });
    expect(page4).toHaveLength(1);
  });

  it('should return structured audit report via admin.getAuditReport', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();

    const policy = new GovernedPolicy(store);
    await policy.recordAction(makeAuditEntry({ userId: 'u1' }));
    await policy.recordAction(makeAuditEntry({ userId: 'u2' }));

    const admin = new GovernanceAdmin(store);
    const report = await admin.getAuditReport({});

    expect(report.totalEntries).toBe(2);
    expect(report.entries).toHaveLength(2);
    expect(report.filter).toEqual({});
    expect(report.generatedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// 7. GovernedPolicy vs OpenPolicy Comparison
// ---------------------------------------------------------------------------
describe('GovernedPolicy vs OpenPolicy Comparison', () => {
  let InMemoryGovernanceStore: Awaited<typeof import('@core/governance')>['InMemoryGovernanceStore'];
  let GovernedPolicy: Awaited<typeof import('@core/governance')>['GovernedPolicy'];
  let OpenPolicy: Awaited<typeof import('@core/types')>['OpenPolicy'];

  beforeEach(async () => {
    const gov = await import('@core/governance');
    const types = await import('@core/types');
    InMemoryGovernanceStore = gov.InMemoryGovernanceStore;
    GovernedPolicy = gov.GovernedPolicy;
    OpenPolicy = types.OpenPolicy;
  });

  it('OpenPolicy: canUseTool always returns true', async () => {
    const open = new OpenPolicy();
    expect(await open.canUseTool('any-user', 'any-tool')).toBe(true);
  });

  it('OpenPolicy: requiresApproval always returns false', async () => {
    const open = new OpenPolicy();
    expect(await open.requiresApproval('any-user', 'any-tool')).toBe(false);
  });

  it('OpenPolicy: getProfile returns null', async () => {
    const open = new OpenPolicy();
    expect(await open.getProfile('any-user')).toBeNull();
  });

  it('GovernedPolicy with no roles: canUseTool returns false', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    const governed = new GovernedPolicy(store);
    expect(await governed.canUseTool('u1', 'file_read')).toBe(false);
  });

  it('GovernedPolicy with no roles: getProfile returns null', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });

    const governed = new GovernedPolicy(store);
    expect(await governed.getProfile('u1')).toBeNull();
  });

  it('GovernedPolicy with proper setup: canUseTool follows role config', async () => {
    const store = new InMemoryGovernanceStore();
    await store.connect();
    await store.createUser({ userId: 'u1', username: 'alice', roles: [], domainIds: [] });
    await store.createRole({
      name: 'dev',
      description: 'Dev',
      allowedSkills: [],
      allowedTools: ['file_read'],
      policy: makePolicy(),
    });
    await store.assignRole('u1', 'dev');

    const governed = new GovernedPolicy(store);
    expect(await governed.canUseTool('u1', 'file_read')).toBe(true);
    expect(await governed.canUseTool('u1', 'shell_exec')).toBe(false);
  });
});
