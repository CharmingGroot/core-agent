/**
 * InMemoryGovernanceStore - 메모리 기반 IGovernanceStore 구현체.
 *
 * 테스트 및 standalone-with-governance 시나리오에서 사용.
 * 모든 데이터는 Map에 저장되며, connect/disconnect는 no-op.
 */
import type {
  IGovernanceStore,
  UserIdentity,
  RoleName,
  RoleDefinition,
  AuditEntry,
  AuditLogFilter,
  ApprovalRequest,
  ApprovalStatus,
  PendingApproval,
} from '@core/types';

interface StoredApproval {
  readonly id: string;
  readonly userId: string;
  readonly toolName: string;
  readonly action: string;
  readonly params: Record<string, unknown>;
  readonly reason?: string;
  readonly createdAt: Date;
  status: ApprovalStatus;
  approvedBy?: string;
  statusReason?: string;
}

export class InMemoryGovernanceStore implements IGovernanceStore {
  private readonly users = new Map<string, UserIdentity>();
  private readonly roles = new Map<RoleName, RoleDefinition>();
  private readonly auditLogs: AuditEntry[] = [];
  private readonly approvals = new Map<string, StoredApproval>();
  private connected = false;

  // --- 연결 관리 ---

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- 사용자 CRUD ---

  async createUser(user: UserIdentity): Promise<void> {
    this.users.set(user.userId, user);
  }

  async getUser(userId: string): Promise<UserIdentity | undefined> {
    return this.users.get(userId);
  }

  async updateUser(
    userId: string,
    updates: Partial<UserIdentity>,
  ): Promise<void> {
    const existing = this.users.get(userId);
    if (!existing) {
      throw new Error(`User not found: ${userId}`);
    }
    this.users.set(userId, { ...existing, ...updates, userId });
  }

  async deleteUser(userId: string): Promise<void> {
    this.users.delete(userId);
  }

  async listUsers(): Promise<readonly UserIdentity[]> {
    return [...this.users.values()];
  }

  // --- 역할 CRUD ---

  async createRole(role: RoleDefinition): Promise<void> {
    this.roles.set(role.name, role);
  }

  async getRole(name: RoleName): Promise<RoleDefinition | undefined> {
    return this.roles.get(name);
  }

  async updateRole(
    name: RoleName,
    updates: Partial<RoleDefinition>,
  ): Promise<void> {
    const existing = this.roles.get(name);
    if (!existing) {
      throw new Error(`Role not found: ${name}`);
    }
    this.roles.set(name, { ...existing, ...updates, name });
  }

  async deleteRole(name: RoleName): Promise<void> {
    this.roles.delete(name);
  }

  async listRoles(): Promise<readonly RoleDefinition[]> {
    return [...this.roles.values()];
  }

  // --- 할당 ---

  async assignRole(userId: string, roleName: RoleName): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    if (user.roles.includes(roleName)) {
      return;
    }
    this.users.set(userId, {
      ...user,
      roles: [...user.roles, roleName],
    });
  }

  async revokeRole(userId: string, roleName: RoleName): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    this.users.set(userId, {
      ...user,
      roles: user.roles.filter((r) => r !== roleName),
    });
  }

  async assignDomain(userId: string, domainId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    if (user.domainIds.includes(domainId)) {
      return;
    }
    this.users.set(userId, {
      ...user,
      domainIds: [...user.domainIds, domainId],
    });
  }

  async revokeDomain(userId: string, domainId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    this.users.set(userId, {
      ...user,
      domainIds: user.domainIds.filter((d) => d !== domainId),
    });
  }

  // --- 감사 로그 ---

  async insertAuditLog(entry: AuditEntry): Promise<void> {
    this.auditLogs.push(entry);
  }

  async queryAuditLogs(
    filter: AuditLogFilter,
  ): Promise<readonly AuditEntry[]> {
    let results = [...this.auditLogs];

    if (filter.userId) {
      results = results.filter((e) => e.userId === filter.userId);
    }
    if (filter.domainId) {
      results = results.filter((e) => e.domainId === filter.domainId);
    }
    if (filter.action) {
      results = results.filter((e) => e.action === filter.action);
    }
    if (filter.from) {
      results = results.filter((e) => e.timestamp >= filter.from!);
    }
    if (filter.to) {
      results = results.filter((e) => e.timestamp <= filter.to!);
    }
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  // --- 승인 ---

  async createApprovalRequest(
    request: ApprovalRequest & { id: string },
  ): Promise<void> {
    this.approvals.set(request.id, {
      id: request.id,
      userId: request.userId,
      toolName: request.toolName,
      action: request.action,
      params: request.params,
      reason: request.reason,
      createdAt: new Date(),
      status: 'pending',
    });
  }

  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedBy?: string,
    reason?: string,
  ): Promise<void> {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval not found: ${id}`);
    }
    this.approvals.set(id, {
      ...approval,
      status,
      approvedBy,
      statusReason: reason,
    });
  }

  async getPendingApprovals(
    approverId?: string,
  ): Promise<readonly PendingApproval[]> {
    const pending: PendingApproval[] = [];

    for (const approval of this.approvals.values()) {
      if (approval.status !== 'pending') {
        continue;
      }
      // approverId 필터가 있으면 해당 사용자 것만 반환하지 않음
      // (approverId는 승인자 기준 필터링 — 현재 in-memory에서는 모두 반환)
      if (approverId !== undefined) {
        // In-memory store는 승인자 매핑이 없으므로 모든 pending 반환
      }
      pending.push({
        id: approval.id,
        userId: approval.userId,
        toolName: approval.toolName,
        action: approval.action,
        params: approval.params,
        reason: approval.reason,
        createdAt: approval.createdAt,
      });
    }

    return pending;
  }
}
