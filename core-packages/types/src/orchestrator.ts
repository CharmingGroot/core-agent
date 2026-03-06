/**
 * Orchestrator — Goal 분해 + Sub-Agent 라우팅.
 * Orchestrator의 도구 = Sub-Agent들.
 */

export interface SubAgentDescriptor {
  /** Sub-Agent 식별자 (e.g., "agent_code_review") */
  readonly id: string;
  /** 사람이 읽을 수 있는 설명 */
  readonly description: string;
  /** 연결된 스킬 이름 */
  readonly skillName: string;
  /** Sub-Agent에 전달할 파라미터 스키마 */
  readonly parameters: readonly SubAgentParam[];
}

export interface SubAgentParam {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
}

/** Orchestrator가 LLM에게 보내는 sub-agent 호출 결과 */
export interface SubAgentResult {
  readonly agentId: string;
  readonly skillName: string;
  readonly success: boolean;
  /** 요약된 결과 (전체 tool call 히스토리가 아닌 최종 결과만) */
  readonly summary: string;
  readonly error?: string;
  readonly tokenUsage: { input: number; output: number };
  readonly durationMs: number;
}

/** Goal 분해 계획 */
export interface TaskPlan {
  readonly goalId: string;
  readonly originalGoal: string;
  readonly tasks: readonly PlannedTask[];
  readonly createdAt: Date;
}

export interface PlannedTask {
  readonly taskId: string;
  readonly description: string;
  readonly agentId: string;
  readonly skillName: string;
  readonly params: Record<string, unknown>;
  readonly dependsOn: readonly string[];
  readonly status: TaskStatus;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';
