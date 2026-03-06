import { describe, it, expect, beforeEach } from 'vitest';
import { GovernedPolicy } from '../src/governed-policy.js';
import { InMemoryGovernanceStore } from '../src/stores/in-memory-store.js';
import type {
  GovernancePolicy,
  RoleDefinition,
  AuditEntry,
} from '@core/types';

const BASIC_POLICY: GovernancePolicy = {
  approvalRequired: ['deploy'],
  auditLevel: 'full',
  maxTokensPerRequest: 4096,
  maxToolCallsPerSession: 50,
  dataClassification: 'internal',
  allowedProviders: ['anthropic'],
  blockedCommands: [],
};

const DEV_ROLE: RoleDefinition = {
  name: 'developer',
  description: 'Developer role',
  allowedSkills: ['code-gen', 'test-gen'],
  allowedTools: ['bash', 'read-file', 'write-file'],
  policy: BASIC_POLICY,
};

const VIEWER_ROLE: RoleDefinition = {
  name: 'viewer',
  description: 'Read-only role',
  allowedSkills: ['search'],
  allowedTools: ['read-file'],
  policy: {
    ...BASIC_POLICY,
    approvalRequired: [],
  },
};

describe('GovernedPolicy', () => {
  let store: InMemoryGovernanceStore;
  let policy: GovernedPolicy;

  beforeEach(async () => {
    store = new InMemoryGovernanceStore();
    policy = new GovernedPolicy(store);

    // Set up test data
    await store.createRole(DEV_ROLE);
    await store.createRole(VIEWER_ROLE);
    await store.createUser({
      userId: 'user-1',
      username: 'alice',
      roles: ['developer'],
      domainIds: [],
    });
    await store.createUser({
      userId: 'user-2',
      username: 'bob',
      roles: ['viewer'],
      domainIds: [],
    });
  });

  // --- canUseSkill ---

  it('should allow skill that role permits', async () => {
    const result = await policy.canUseSkill('user-1', 'code-gen');
    expect(result).toBe(true);
  });

  it('should deny skill that role does not permit', async () => {
    const result = await policy.canUseSkill('user-2', 'code-gen');
    expect(result).toBe(false);
  });

  it('should deny skill for non-existent user', async () => {
    const result = await policy.canUseSkill('non-existent', 'code-gen');
    expect(result).toBe(false);
  });

  // --- canUseTool ---

  it('should allow tool that role permits', async () => {
    const result = await policy.canUseTool('user-1', 'bash');
    expect(result).toBe(true);
  });

  it('should deny tool that role does not permit', async () => {
    const result = await policy.canUseTool('user-2', 'bash');
    expect(result).toBe(false);
  });

  // --- requiresApproval ---

  it('should require approval for tools in approvalRequired', async () => {
    const result = await policy.requiresApproval('user-1', 'deploy');
    expect(result).toBe(true);
  });

  it('should not require approval for tools not in approvalRequired', async () => {
    const result = await policy.requiresApproval('user-1', 'bash');
    expect(result).toBe(false);
  });

  it('should not require approval if viewer role has empty approvalRequired', async () => {
    const result = await policy.requiresApproval('user-2', 'deploy');
    expect(result).toBe(false);
  });

  // --- requestApproval ---

  it('should create pending approval request', async () => {
    const result = await policy.requestApproval({
      userId: 'user-1',
      action: 'tool_call',
      toolName: 'deploy',
      params: { env: 'production' },
      reason: 'Deploy to prod',
    });

    expect(result.status).toBe('pending');
    expect(result.timestamp).toBeInstanceOf(Date);

    const pending = await store.getPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('deploy');
  });

  // --- recordAction ---

  it('should record audit entry in store', async () => {
    const entry: AuditEntry = {
      timestamp: new Date(),
      runId: 'run-1',
      agentId: 'agent-1',
      userId: 'user-1',
      action: 'tool_call',
      toolName: 'bash',
      decision: 'allowed',
    };

    await policy.recordAction(entry);

    const logs = await store.queryAuditLogs({ userId: 'user-1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].toolName).toBe('bash');
  });

  // --- getAllowedSkills / getAllowedTools ---

  it('should aggregate allowed skills from all user roles', async () => {
    // Assign both roles to user-1
    await store.assignRole('user-1', 'viewer');

    const skills = await policy.getAllowedSkills('user-1');
    expect(skills).toContain('code-gen');
    expect(skills).toContain('test-gen');
    expect(skills).toContain('search');
  });

  it('should aggregate allowed tools from all user roles', async () => {
    await store.assignRole('user-1', 'viewer');

    const tools = await policy.getAllowedTools('user-1');
    expect(tools).toContain('bash');
    expect(tools).toContain('read-file');
    expect(tools).toContain('write-file');
    // read-file is in both roles but should appear once
    const readFileCount = tools.filter((t) => t === 'read-file').length;
    expect(readFileCount).toBe(1);
  });

  it('should return empty arrays for non-existent user', async () => {
    const skills = await policy.getAllowedSkills('non-existent');
    expect(skills).toHaveLength(0);

    const tools = await policy.getAllowedTools('non-existent');
    expect(tools).toHaveLength(0);
  });

  // --- wildcard role ---

  it('should allow all skills/tools when role has wildcard', async () => {
    await store.createRole({
      name: 'admin',
      description: 'Admin role with wildcard access',
      allowedSkills: ['*'],
      allowedTools: ['*'],
      policy: BASIC_POLICY,
    });
    await store.createUser({
      userId: 'admin-1',
      username: 'admin',
      roles: ['admin'],
      domainIds: [],
    });

    expect(await policy.canUseSkill('admin-1', 'anything')).toBe(true);
    expect(await policy.canUseTool('admin-1', 'anything')).toBe(true);
  });

  // --- getProfile ---

  it('should return null profile for non-existent user', async () => {
    const profile = await policy.getProfile('non-existent');
    expect(profile).toBeNull();
  });

  it('should compute profile from single role', async () => {
    const profile = await policy.getProfile('user-1');
    expect(profile).not.toBeNull();
    expect(profile!.allowedTools).toEqual(['bash', 'read-file', 'write-file']);
    expect(profile!.allowedSkills).toEqual(['code-gen', 'test-gen']);
    expect(profile!.approvalRequired).toEqual(['deploy']);
    expect(profile!.policy.auditLevel).toBe('full');
    expect(profile!.policy.dataClassification).toBe('internal');
  });

  it('should merge profile from multiple roles', async () => {
    await store.assignRole('user-1', 'viewer');

    const profile = await policy.getProfile('user-1');
    expect(profile).not.toBeNull();

    // Merged tools (deduplicated)
    expect(profile!.allowedTools).toContain('bash');
    expect(profile!.allowedTools).toContain('read-file');
    expect(profile!.allowedTools).toContain('write-file');

    // Merged skills
    expect(profile!.allowedSkills).toContain('code-gen');
    expect(profile!.allowedSkills).toContain('test-gen');
    expect(profile!.allowedSkills).toContain('search');

    // approvalRequired from developer role only (viewer has empty)
    expect(profile!.approvalRequired).toContain('deploy');
  });

  it('should use most restrictive policy values when merging', async () => {
    await store.createRole({
      name: 'restricted',
      description: 'Restricted role',
      allowedSkills: [],
      allowedTools: [],
      policy: {
        approvalRequired: [],
        auditLevel: 'basic',
        maxTokensPerRequest: 1024,
        maxToolCallsPerSession: 100,
        dataClassification: 'confidential',
        allowedProviders: ['openai'],
        blockedCommands: [],
      },
    });
    await store.assignRole('user-1', 'restricted');

    const profile = await policy.getProfile('user-1');
    // Should take highest audit level and data classification
    expect(profile!.policy.auditLevel).toBe('full');
    expect(profile!.policy.dataClassification).toBe('confidential');
    expect(profile!.policy.allowedProviders).toContain('anthropic');
    expect(profile!.policy.allowedProviders).toContain('openai');
  });
});
