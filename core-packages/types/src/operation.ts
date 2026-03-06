/**
 * Operation — 작업 추적 단위.
 * 모든 Harness 요청은 Operation으로 관리된다.
 * Standalone/Governed 구분 없이 동작.
 */

export type OperationStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface OperationProgress {
  readonly current: number;
  readonly total: number;
  readonly message: string;
}

export interface OperationState {
  readonly operationId: string;
  readonly requestId: string;
  readonly userId: string;
  readonly domainId: string;
  readonly goal: string;
  status: OperationStatus;
  progress?: OperationProgress;
  readonly startedAt: Date;
  completedAt?: Date;
  error?: string;
  /** Sub-task 실행 결과 요약 */
  readonly taskResults: readonly OperationTaskResult[];
  /** 토큰 사용량 */
  tokenUsage: { input: number; output: number };
}

export interface OperationTaskResult {
  readonly taskId: string;
  readonly skillName: string;
  readonly status: OperationStatus;
  readonly summary: string;
  readonly durationMs: number;
}

export interface OperationFilter {
  readonly userId?: string;
  readonly domainId?: string;
  readonly status?: OperationStatus;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * IOperationTracker — 작업 상태 추적 인터페이스.
 * InMemory 기본 구현, DB 어댑터 확장 가능.
 */
export interface IOperationTracker {
  /** 새 operation 생성. operationId 반환. */
  create(params: {
    requestId: string;
    userId: string;
    domainId: string;
    goal: string;
  }): string;

  /** operation 상태를 running으로 전환 */
  start(operationId: string): void;

  /** 진행률 업데이트 */
  updateProgress(operationId: string, progress: OperationProgress): void;

  /** sub-task 결과 추가 */
  addTaskResult(operationId: string, result: OperationTaskResult): void;

  /** operation 완료 처리 */
  complete(operationId: string, tokenUsage?: { input: number; output: number }): void;

  /** operation 실패 처리 */
  fail(operationId: string, error: string): void;

  /** operation 취소 처리 */
  cancel(operationId: string): void;

  /** 단일 operation 조회 */
  get(operationId: string): OperationState | undefined;

  /** 필터링된 operation 목록 조회 */
  list(filter?: OperationFilter): readonly OperationState[];

  /** 현재 running 상태인 operation 목록 */
  listActive(): readonly OperationState[];
}
