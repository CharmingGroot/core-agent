/**
 * IRule — 도구 실행 전후에 개입하는 정책 미들웨어.
 *
 * Phase:
 *   pre  — 도구 실행 전. block하면 실행 안 됨.
 *   post — 도구 실행 후. 결과 필터링, 감사 로그 등.
 */
export type RulePhase = 'pre' | 'post';
export type RuleSeverity = 'block' | 'warn' | 'log';

export interface IRule {
  /** 룰 고유 이름 (e.g., "no-rm-rf", "audit-log") */
  readonly name: string;

  /** 실행 단계 */
  readonly phase: RulePhase;

  /** block: 실행 차단, warn: 경고 후 진행, log: 기록만 */
  readonly severity: RuleSeverity;

  /** 사람이 읽을 수 있는 설명 */
  readonly description: string;

  /** 룰 평가 */
  evaluate(context: RuleContext): Promise<RuleResult>;
}

export interface RuleContext {
  /** 현재 에이전트 ID */
  readonly agentId: string;
  /** 현재 스킬 이름 */
  readonly skillName: string;
  /** 호출할/호출한 도구 이름 */
  readonly toolName: string;
  /** 도구 파라미터 */
  readonly toolParams: Record<string, unknown>;
  /** post 단계에서만 존재 — 도구 실행 결과 */
  readonly toolResult?: ToolResultRef;
  /** 사용자 정보 */
  readonly userId: string;
  /** 도메인 ID */
  readonly domainId?: string;
  /** 추가 메타데이터 */
  readonly metadata: Record<string, unknown>;
}

export interface ToolResultRef {
  readonly success: boolean;
  readonly output: string;
  readonly error?: string;
  readonly durationMs: number;
}

export interface RuleResult {
  /** 허용 여부 (false면 block 또는 경고) */
  readonly allowed: boolean;
  /** 차단/경고 사유 */
  readonly reason?: string;
  /** 파라미터 강제 수정 (pre 단계에서만 유효) */
  readonly modifications?: Record<string, unknown>;
  /** 출력 필터링 (post 단계에서만 유효) */
  readonly filteredOutput?: string;
}

/** 룰 CRUD */
export interface IRuleRegistry {
  register(rule: IRule): void;
  get(name: string): IRule | undefined;
  has(name: string): boolean;
  getAll(): readonly IRule[];
  getByPhase(phase: RulePhase): readonly IRule[];
  unregister(name: string): boolean;
}
