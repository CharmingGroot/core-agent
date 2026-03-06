/**
 * SubAgentExecutor — Sub-Agent 실행 추상화.
 *
 * 각 Sub-Agent는 독립된 컨텍스트 윈도우에서 실행되며,
 * 결과는 요약되어 Orchestrator에 반환된다.
 *
 * 실제 구현은 @core/harness에서 제공한다.
 * 여기서는 인터페이스와 테스트용 Mock만 정의한다.
 */
import type {
  PlannedTask,
  SubAgentResult,
  IPolicyProvider,
} from '@core/types';

/** Sub-Agent 실행에 필요한 컨텍스트 */
export interface ExecutionContext {
  /** 도메인 식별자 (멀티테넌트 환경용) */
  readonly domainId?: string;
  /** 요청한 사용자 식별자 */
  readonly userId: string;
  /** 정책 프로바이더 */
  readonly policy: IPolicyProvider;
  /** 실행 타임아웃 (ms) */
  readonly timeout?: number;
}

/** Sub-Agent 실행 인터페이스 */
export interface ISubAgentExecutor {
  execute(
    task: PlannedTask,
    context: ExecutionContext,
  ): Promise<SubAgentResult>;
}

const DEFAULT_MOCK_DURATION_MS = 50;
const DEFAULT_MOCK_INPUT_TOKENS = 100;
const DEFAULT_MOCK_OUTPUT_TOKENS = 50;

/**
 * MockSubAgentExecutor — 테스트용 Mock 구현.
 * 항상 성공 결과를 반환하며, 커스텀 결과 주입이 가능하다.
 */
export class MockSubAgentExecutor implements ISubAgentExecutor {
  /** 실행 기록 (테스트 검증용) */
  readonly executedTasks: PlannedTask[] = [];

  private readonly customResults: Map<string, SubAgentResult> = new Map();
  private readonly failingAgents: Set<string> = new Set();

  /**
   * 특정 taskId에 대해 커스텀 결과를 설정한다.
   */
  setResult(taskId: string, result: SubAgentResult): void {
    this.customResults.set(taskId, result);
  }

  /**
   * 특정 agentId를 실패하도록 설정한다.
   */
  setAgentFailure(agentId: string): void {
    this.failingAgents.add(agentId);
  }

  async execute(
    task: PlannedTask,
    _context: ExecutionContext,
  ): Promise<SubAgentResult> {
    this.executedTasks.push(task);

    // 커스텀 결과가 있으면 반환
    const custom = this.customResults.get(task.taskId);
    if (custom) {
      return custom;
    }

    // 실패 설정된 에이전트라면 실패 결과 반환
    if (this.failingAgents.has(task.agentId)) {
      return {
        agentId: task.agentId,
        skillName: task.skillName,
        success: false,
        summary: '',
        error: `Agent ${task.agentId} failed to execute task`,
        tokenUsage: {
          input: DEFAULT_MOCK_INPUT_TOKENS,
          output: DEFAULT_MOCK_OUTPUT_TOKENS,
        },
        durationMs: DEFAULT_MOCK_DURATION_MS,
      };
    }

    // 기본 성공 결과
    return {
      agentId: task.agentId,
      skillName: task.skillName,
      success: true,
      summary: `Completed: ${task.description}`,
      tokenUsage: {
        input: DEFAULT_MOCK_INPUT_TOKENS,
        output: DEFAULT_MOCK_OUTPUT_TOKENS,
      },
      durationMs: DEFAULT_MOCK_DURATION_MS,
    };
  }
}
