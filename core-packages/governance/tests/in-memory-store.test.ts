import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGovernanceStore } from '../src/stores/in-memory-store.js';
import type {
  UserIdentity,
  RoleDefinition,
  GovernancePolicy,
  AuditEntry,
} from '@core/types';

const DEFAULT_POLICY: GovernancePolicy = {
  approvalRequired: [],
  auditLevel: 'basic',
  maxTokensPerRequest: 4096,
  maxToolCallsPerSession: 100,
  dataClassification: 'internal',
  allowedProviders: ['anthropic'],
  blockedCommands: [],
};

function makeUser(overrides?: Partial<UserIdentity>): UserIdentity {
  return {
    userId: 'user-1',
    username: 'alice',
    roles: [],
    domainIds: [],
    ...overrides,
  };
}

function makeRole(overrides?: Partial<RoleDefinition>): RoleDefinition {
  return {
    name: 'developer',
    description: 'Developer role',
    allowedSkills: ['code-gen'],
    allowedTools: ['bash', 'read-file'],
    policy: DEFAULT_POLICY,
    ...overrides,
  };
}

function makeAuditEntry(overrides?: Partial<AuditEntry>): AuditEntry {
  return {
    timestamp: new Date('2026-01-15T10:00:00Z'),
    runId: 'run-1',
    agentId: 'agent-1',
    userId: 'user-1',
    action: 'tool_call',
    decision: 'allowed',
    ...overrides,
  };
}

describe('InMemoryGovernanceStore', () => {
  let store: InMemoryGovernanceStore;

  beforeEach(() => {
    store = new InMemoryGovernanceStore();
  });

  // --- 연결 ---

  it('should connect and disconnect as no-ops', async () => {
    expect(store.isConnected()).toBe(false);
    await store.connect();
    expect(store.isConnected()).toBe(true);
    await store.disconnect();
    expect(store.isConnected()).toBe(false);
  });

  // --- 사용자 CRUD ---

  it('should create and retrieve a user', async () => {
    const user = makeUser();
    await store.createUser(user);
    const retrieved = await store.getUser('user-1');
    expect(retrieved).toEqual(user);
  });

  it('should return undefined for non-existent user', async () => {
    const result = await store.getUser('non-existent');
    expect(result).toBeUndefined();
  });

  it('should update a user', async () => {
    await store.createUser(makeUser());
    await store.updateUser('user-1', { username: 'alice-updated' });
    const updated = await store.getUser('user-1');
    expect(updated?.username).toBe('alice-updated');
    expect(updated?.userId).toBe('user-1');
  });

  it('should throw when updating non-existent user', async () => {
    await expect(
      store.updateUser('non-existent', { username: 'x' }),
    ).rejects.toThrow('User not found');
  });

  it('should delete a user', async () => {
    await store.createUser(makeUser());
    await store.deleteUser('user-1');
    expect(await store.getUser('user-1')).toBeUndefined();
  });

  it('should list all users', async () => {
    await store.createUser(makeUser({ userId: 'u1', username: 'a' }));
    await store.createUser(makeUser({ userId: 'u2', username: 'b' }));
    const users = await store.listUsers();
    expect(users).toHaveLength(2);
  });

  // --- 역할 CRUD ---

  it('should create and retrieve a role', async () => {
    const role = makeRole();
    await store.createRole(role);
    const retrieved = await store.getRole('developer');
    expect(retrieved).toEqual(role);
  });

  it('should list all roles', async () => {
    await store.createRole(makeRole({ name: 'admin' }));
    await store.createRole(makeRole({ name: 'viewer' }));
    const roles = await store.listRoles();
    expect(roles).toHaveLength(2);
  });

  // --- 할당 ---

  it('should assign and revoke roles on a user', async () => {
    await store.createUser(makeUser());
    await store.createRole(makeRole());

    await store.assignRole('user-1', 'developer');
    let user = await store.getUser('user-1');
    expect(user?.roles).toContain('developer');

    await store.revokeRole('user-1', 'developer');
    user = await store.getUser('user-1');
    expect(user?.roles).not.toContain('developer');
  });

  it('should assign and revoke domains on a user', async () => {
    await store.createUser(makeUser());

    await store.assignDomain('user-1', 'domain-a');
    let user = await store.getUser('user-1');
    expect(user?.domainIds).toContain('domain-a');

    await store.revokeDomain('user-1', 'domain-a');
    user = await store.getUser('user-1');
    expect(user?.domainIds).not.toContain('domain-a');
  });

  it('should not duplicate role assignment', async () => {
    await store.createUser(makeUser());
    await store.assignRole('user-1', 'developer');
    await store.assignRole('user-1', 'developer');
    const user = await store.getUser('user-1');
    expect(user?.roles.filter((r) => r === 'developer')).toHaveLength(1);
  });

  // --- 감사 로그 ---

  it('should insert and query audit logs', async () => {
    await store.insertAuditLog(makeAuditEntry());
    await store.insertAuditLog(
      makeAuditEntry({ userId: 'user-2', action: 'llm_request' }),
    );

    const all = await store.queryAuditLogs({});
    expect(all).toHaveLength(2);

    const filtered = await store.queryAuditLogs({ userId: 'user-1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].userId).toBe('user-1');
  });

  it('should filter audit logs by action', async () => {
    await store.insertAuditLog(makeAuditEntry({ action: 'tool_call' }));
    await store.insertAuditLog(makeAuditEntry({ action: 'skill_load' }));
    await store.insertAuditLog(makeAuditEntry({ action: 'tool_call' }));

    const result = await store.queryAuditLogs({ action: 'tool_call' });
    expect(result).toHaveLength(2);
  });

  it('should respect limit and offset in audit log queries', async () => {
    for (let i = 0; i < 5; i++) {
      await store.insertAuditLog(makeAuditEntry({ runId: `run-${i}` }));
    }

    const limited = await store.queryAuditLogs({ limit: 2 });
    expect(limited).toHaveLength(2);

    const offsetted = await store.queryAuditLogs({ offset: 3 });
    expect(offsetted).toHaveLength(2);
  });

  // --- 승인 ---

  it('should create and query pending approvals', async () => {
    await store.createApprovalRequest({
      id: 'approval-1',
      userId: 'user-1',
      toolName: 'deploy',
      action: 'tool_call',
      params: { env: 'production' },
      reason: 'Deploy to prod',
    });

    const pending = await store.getPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('approval-1');
    expect(pending[0].toolName).toBe('deploy');
  });

  it('should update approval status and exclude from pending', async () => {
    await store.createApprovalRequest({
      id: 'approval-2',
      userId: 'user-1',
      toolName: 'deploy',
      action: 'tool_call',
      params: {},
    });

    await store.updateApprovalStatus('approval-2', 'approved', 'admin-1', 'Looks good');
    const pending = await store.getPendingApprovals();
    expect(pending).toHaveLength(0);
  });
});
