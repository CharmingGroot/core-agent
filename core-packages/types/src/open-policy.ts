import type {
  IPolicyProvider,
  ApprovalRequest,
  ApprovalResult,
  AuditEntry,
} from './policy.js';

/**
 * OpenPolicy — Standalone 모드 기본 구현.
 * 모든 것을 허용하고, 감사 로그는 no-op.
 * governance 패키지 없이도 동작한다.
 */
export class OpenPolicy implements IPolicyProvider {
  async canUseSkill(): Promise<boolean> {
    return true;
  }

  async canUseTool(): Promise<boolean> {
    return true;
  }

  async requiresApproval(): Promise<boolean> {
    return false;
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalResult> {
    return {
      status: 'approved',
      reason: 'standalone mode — auto-approved',
      timestamp: new Date(),
    };
  }

  async recordAction(_entry: AuditEntry): Promise<void> {
    // no-op in standalone mode
  }

  async getAllowedSkills(): Promise<readonly string[]> {
    return ['*'];
  }

  async getAllowedTools(): Promise<readonly string[]> {
    return ['*'];
  }

  async getProfile(): Promise<null> {
    // Standalone 모드에서는 프로필 없음 — 모든 도구 접근 허용
    return null;
  }
}
