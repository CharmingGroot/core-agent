/**
 * Governance — RBAC, 할당, 감사, 승인.
 * DB는 이 패키지(타입)에서 정의하지 않고,
 * @core/governance 구현체에서 어댑터로 분리한다.
 */

export type RoleName = string;

export interface UserIdentity {
  readonly userId: string;
  readonly username: string;
  readonly roles: readonly RoleName[];
  readonly domainIds: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface RoleDefinition {
  readonly name: RoleName;
  readonly description: string;
  /** 이 역할에 허용된 스킬 */
  readonly allowedSkills: readonly string[];
  /** 이 역할에 허용된 도구 */
  readonly allowedTools: readonly string[];
  /** 이 역할의 거버넌스 정책 */
  readonly policy: GovernancePolicy;
}

export interface GovernancePolicy {
  /** 승인이 필요한 도구 목록 */
  readonly approvalRequired: readonly string[];
  /** 감사 수준 */
  readonly auditLevel: 'none' | 'basic' | 'full';
  /** 요청당 최대 토큰 */
  readonly maxTokensPerRequest: number;
  /** 세션당 최대 tool call 횟수 */
  readonly maxToolCallsPerSession: number;
  /** 데이터 분류 등급 */
  readonly dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
  /** 허용된 LLM 프로바이더 */
  readonly allowedProviders: readonly string[];
  /** 차단 셸 명령 패턴 (regex) */
  readonly blockedCommands: readonly string[];
}

/** DB 어댑터 인터페이스 — pg, mysql, mariadb, mongodb 모두 이걸 구현 */
export interface IGovernanceStore {
  // 사용자 CRUD
  createUser(user: UserIdentity): Promise<void>;
  getUser(userId: string): Promise<UserIdentity | undefined>;
  updateUser(userId: string, updates: Partial<UserIdentity>): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  listUsers(): Promise<readonly UserIdentity[]>;

  // 역할 CRUD
  createRole(role: RoleDefinition): Promise<void>;
  getRole(name: RoleName): Promise<RoleDefinition | undefined>;
  updateRole(name: RoleName, updates: Partial<RoleDefinition>): Promise<void>;
  deleteRole(name: RoleName): Promise<void>;
  listRoles(): Promise<readonly RoleDefinition[]>;

  // 할당
  assignRole(userId: string, roleName: RoleName): Promise<void>;
  revokeRole(userId: string, roleName: RoleName): Promise<void>;
  assignDomain(userId: string, domainId: string): Promise<void>;
  revokeDomain(userId: string, domainId: string): Promise<void>;

  // 감사 로그
  insertAuditLog(entry: import('./policy.js').AuditEntry): Promise<void>;
  queryAuditLogs(filter: AuditLogFilter): Promise<readonly import('./policy.js').AuditEntry[]>;

  // 승인
  createApprovalRequest(request: import('./policy.js').ApprovalRequest & { id: string }): Promise<void>;
  updateApprovalStatus(
    id: string,
    status: import('./policy.js').ApprovalStatus,
    approvedBy?: string,
    reason?: string,
  ): Promise<void>;
  getPendingApprovals(approverId?: string): Promise<readonly PendingApproval[]>;

  // 연결 관리
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export interface AuditLogFilter {
  readonly userId?: string;
  readonly domainId?: string;
  readonly action?: import('./policy.js').AuditAction;
  readonly from?: Date;
  readonly to?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PendingApproval {
  readonly id: string;
  readonly userId: string;
  readonly toolName: string;
  readonly action: string;
  readonly params: Record<string, unknown>;
  readonly reason?: string;
  readonly createdAt: Date;
}
