/**
 * GovernanceAdmin - 관리자 작업 파사드.
 *
 * IGovernanceStore를 래핑하여 고수준 관리 작업을 제공한다.
 * 역할/사용자/스킬/도구 할당 및 감사 리포트 조회.
 */
import type {
  IGovernanceStore,
  UserIdentity,
  RoleName,
  RoleDefinition,
  GovernancePolicy,
  AuditEntry,
  AuditLogFilter,
} from '@core/types';

/** 감사 리포트 결과 */
export interface AuditReport {
  readonly filter: AuditLogFilter;
  readonly totalEntries: number;
  readonly entries: readonly AuditEntry[];
  readonly generatedAt: Date;
}

export class GovernanceAdmin {
  private readonly store: IGovernanceStore;

  constructor(store: IGovernanceStore) {
    this.store = store;
  }

  /**
   * 새 사용자를 생성한다.
   */
  async createUser(
    userId: string,
    username: string,
    metadata?: Record<string, unknown>,
  ): Promise<UserIdentity> {
    const user: UserIdentity = {
      userId,
      username,
      roles: [],
      domainIds: [],
      metadata,
    };
    await this.store.createUser(user);
    return user;
  }

  /**
   * 사용자에게 역할을 할당한다.
   */
  async assignRole(userId: string, roleName: RoleName): Promise<void> {
    const user = await this.store.getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    const role = await this.store.getRole(roleName);
    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }
    await this.store.assignRole(userId, roleName);
  }

  /**
   * 사용자에서 역할을 회수한다.
   */
  async revokeRole(userId: string, roleName: RoleName): Promise<void> {
    const user = await this.store.getUser(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    await this.store.revokeRole(userId, roleName);
  }

  /**
   * 역할에 스킬을 추가한다.
   */
  async assignSkillToRole(
    roleName: RoleName,
    skillName: string,
  ): Promise<void> {
    const role = await this.store.getRole(roleName);
    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }
    if (role.allowedSkills.includes(skillName)) {
      return;
    }
    await this.store.updateRole(roleName, {
      allowedSkills: [...role.allowedSkills, skillName],
    });
  }

  /**
   * 역할에서 스킬을 제거한다.
   */
  async revokeSkillFromRole(
    roleName: RoleName,
    skillName: string,
  ): Promise<void> {
    const role = await this.store.getRole(roleName);
    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }
    await this.store.updateRole(roleName, {
      allowedSkills: role.allowedSkills.filter((s) => s !== skillName),
    });
  }

  /**
   * 역할에 도구를 추가한다.
   */
  async assignToolToRole(
    roleName: RoleName,
    toolName: string,
  ): Promise<void> {
    const role = await this.store.getRole(roleName);
    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }
    if (role.allowedTools.includes(toolName)) {
      return;
    }
    await this.store.updateRole(roleName, {
      allowedTools: [...role.allowedTools, toolName],
    });
  }

  /**
   * 역할에서 도구를 제거한다.
   */
  async revokeToolFromRole(
    roleName: RoleName,
    toolName: string,
  ): Promise<void> {
    const role = await this.store.getRole(roleName);
    if (!role) {
      throw new Error(`Role not found: ${roleName}`);
    }
    await this.store.updateRole(roleName, {
      allowedTools: role.allowedTools.filter((t) => t !== toolName),
    });
  }

  /**
   * 역할의 거버넌스 정책을 설정한다.
   * 기존 역할이 없으면 새로 생성한다.
   */
  async setPolicy(
    roleName: RoleName,
    policy: GovernancePolicy,
    description?: string,
  ): Promise<void> {
    const existing = await this.store.getRole(roleName);

    if (existing) {
      await this.store.updateRole(roleName, { policy });
    } else {
      const role: RoleDefinition = {
        name: roleName,
        description: description ?? '',
        allowedSkills: [],
        allowedTools: [],
        policy,
      };
      await this.store.createRole(role);
    }
  }

  /**
   * 감사 로그를 조회하여 리포트를 반환한다.
   */
  async getAuditReport(filter: AuditLogFilter): Promise<AuditReport> {
    const entries = await this.store.queryAuditLogs(filter);

    return {
      filter,
      totalEntries: entries.length,
      entries,
      generatedAt: new Date(),
    };
  }
}
