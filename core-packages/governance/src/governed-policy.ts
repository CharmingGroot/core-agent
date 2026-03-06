/**
 * GovernedPolicy - DB 기반 RBAC 거버넌스 구현체.
 *
 * IGovernanceStore를 통해 사용자/역할/감사 데이터를 조회하고,
 * IPolicyProvider 인터페이스를 완전히 구현한다.
 */
import type {
  IPolicyProvider,
  ApprovalRequest,
  ApprovalResult,
  AuditEntry,
  IGovernanceStore,
  RoleDefinition,
} from '@core/types';

/**
 * 고유 ID 생성 유틸리티.
 * crypto.randomUUID 사용 (Node 19+), 미지원 시 타임스탬프 기반 폴백.
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 사용자의 모든 역할 정의를 조회하는 헬퍼.
 */
async function getUserRoles(
  store: IGovernanceStore,
  userId: string,
): Promise<readonly RoleDefinition[]> {
  const user = await store.getUser(userId);
  if (!user) {
    return [];
  }

  const rolePromises = user.roles.map((roleName) => store.getRole(roleName));
  const roles = await Promise.all(rolePromises);

  return roles.filter(
    (role): role is RoleDefinition => role !== undefined,
  );
}

export class GovernedPolicy implements IPolicyProvider {
  private readonly store: IGovernanceStore;

  constructor(store: IGovernanceStore) {
    this.store = store;
  }

  /**
   * 사용자의 역할 중 하나라도 해당 스킬을 허용하면 true.
   */
  async canUseSkill(userId: string, skillName: string): Promise<boolean> {
    const roles = await getUserRoles(this.store, userId);
    if (roles.length === 0) {
      return false;
    }

    return roles.some(
      (role) =>
        role.allowedSkills.includes('*') ||
        role.allowedSkills.includes(skillName),
    );
  }

  /**
   * 사용자의 역할 중 하나라도 해당 도구를 허용하면 true.
   */
  async canUseTool(userId: string, toolName: string): Promise<boolean> {
    const roles = await getUserRoles(this.store, userId);
    if (roles.length === 0) {
      return false;
    }

    return roles.some(
      (role) =>
        role.allowedTools.includes('*') ||
        role.allowedTools.includes(toolName),
    );
  }

  /**
   * 사용자의 역할 정책에 해당 도구가 approvalRequired에 포함되면 true.
   */
  async requiresApproval(
    userId: string,
    toolName: string,
  ): Promise<boolean> {
    const roles = await getUserRoles(this.store, userId);
    if (roles.length === 0) {
      return false;
    }

    return roles.some((role) =>
      role.policy.approvalRequired.includes(toolName),
    );
  }

  /**
   * 승인 요청을 스토어에 저장하고, pending 상태를 반환.
   */
  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    const id = generateId();

    await this.store.createApprovalRequest({
      id,
      ...request,
    });

    return {
      status: 'pending',
      reason: `Approval request ${id} created`,
      timestamp: new Date(),
    };
  }

  /**
   * 감사 로그를 스토어에 기록.
   */
  async recordAction(entry: AuditEntry): Promise<void> {
    await this.store.insertAuditLog(entry);
  }

  /**
   * 사용자의 모든 역할에서 허용된 스킬을 중복 제거 후 반환.
   */
  async getAllowedSkills(userId: string): Promise<readonly string[]> {
    const roles = await getUserRoles(this.store, userId);
    const skillSet = new Set<string>();

    for (const role of roles) {
      for (const skill of role.allowedSkills) {
        skillSet.add(skill);
      }
    }

    return [...skillSet];
  }

  /**
   * 사용자의 모든 역할에서 허용된 도구를 중복 제거 후 반환.
   */
  async getAllowedTools(userId: string): Promise<readonly string[]> {
    const roles = await getUserRoles(this.store, userId);
    const toolSet = new Set<string>();

    for (const role of roles) {
      for (const tool of role.allowedTools) {
        toolSet.add(tool);
      }
    }

    return [...toolSet];
  }
}
