/**
 * IPolicyProvider — 거버넌스 추상화의 핵심 인터페이스.
 *
 * 모든 @core/* 패키지는 이 인터페이스만 의존한다.
 * - Standalone 모드: OpenPolicy (전부 허용, no-op 로깅)
 * - Governed 모드: GovernedPolicy (DB 기반 RBAC, 감사)
 */
export interface IPolicyProvider {
  /** 사용자가 특정 스킬을 사용할 수 있는가? */
  canUseSkill(userId: string, skillName: string): Promise<boolean>;

  /** 사용자가 특정 도구를 사용할 수 있는가? */
  canUseTool(userId: string, toolName: string): Promise<boolean>;

  /** 이 도구 실행에 관리자 승인이 필요한가? */
  requiresApproval(userId: string, toolName: string): Promise<boolean>;

  /** 승인 요청을 생성한다. 승인되면 true 반환. */
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;

  /** 실행 기록(감사 로그)을 저장한다. */
  recordAction(entry: AuditEntry): Promise<void>;

  /** 사용자의 허용된 스킬 목록 조회 */
  getAllowedSkills(userId: string): Promise<readonly string[]>;

  /** 사용자의 허용된 도구 목록 조회 */
  getAllowedTools(userId: string): Promise<readonly string[]>;

  /**
   * 사용자의 프로필(도구 접근 제어 단위)을 조회한다.
   * Standalone 모드에서는 null 반환 (프로필 필터링 없음).
   * Governed 모드에서는 사용자의 역할 기반으로 Profile을 합성한다.
   */
  getProfile(userId: string): Promise<import('./profile.js').Profile | null>;
}

export interface ApprovalRequest {
  readonly userId: string;
  readonly action: string;
  readonly toolName: string;
  readonly params: Record<string, unknown>;
  readonly reason?: string;
}

export type ApprovalStatus = 'approved' | 'denied' | 'timeout' | 'pending';

export interface ApprovalResult {
  readonly status: ApprovalStatus;
  readonly approvedBy?: string;
  readonly reason?: string;
  readonly timestamp: Date;
}

export type AuditAction =
  | 'tool_call'
  | 'llm_request'
  | 'skill_load'
  | 'approval_request'
  | 'approval_decision'
  | 'policy_violation'
  | 'session_start'
  | 'session_end';

export type AuditDecision = 'allowed' | 'blocked' | 'pending';

export type DataClassification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

export interface AuditEntry {
  readonly timestamp: Date;
  readonly runId: string;
  readonly agentId: string;
  readonly domainId?: string;
  readonly userId: string;
  readonly action: AuditAction;
  readonly toolName?: string;
  readonly skillName?: string;
  readonly input?: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly decision: AuditDecision;
  readonly reason?: string;
  readonly dataClassification?: DataClassification;
  readonly durationMs?: number;
  readonly tokenUsage?: { input: number; output: number };
}
