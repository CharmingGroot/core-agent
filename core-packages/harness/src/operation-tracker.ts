/**
 * InMemoryOperationTracker — 메모리 기반 작업 추적 구현체.
 *
 * Standalone/Governed 모드 무관하게 동작.
 * 모든 Harness 요청에 operationId를 발급하고 상태를 추적한다.
 * EventBus로 상태 변경을 broadcast한다.
 */
import type {
  IOperationTracker,
  OperationState,
  OperationProgress,
  OperationTaskResult,
  OperationFilter,
  OperationStatus,
} from '@core/types';

let counter = 0;

function generateOperationId(): string {
  counter += 1;
  const timestamp = Date.now().toString(36);
  const seq = counter.toString(36).padStart(4, '0');
  return `op-${timestamp}-${seq}`;
}

export interface OperationTrackerEvents {
  onStatusChange?: (operationId: string, status: OperationStatus, state: OperationState) => void;
}

export class InMemoryOperationTracker implements IOperationTracker {
  private readonly operations = new Map<string, OperationState>();
  private readonly events: OperationTrackerEvents;

  constructor(events?: OperationTrackerEvents) {
    this.events = events ?? {};
  }

  create(params: {
    requestId: string;
    userId: string;
    domainId: string;
    goal: string;
  }): string {
    const operationId = generateOperationId();

    const state: OperationState = {
      operationId,
      requestId: params.requestId,
      userId: params.userId,
      domainId: params.domainId,
      goal: params.goal,
      status: 'pending',
      startedAt: new Date(),
      taskResults: [],
      tokenUsage: { input: 0, output: 0 },
    };

    this.operations.set(operationId, state);
    this.emitChange(operationId, 'pending', state);
    return operationId;
  }

  start(operationId: string): void {
    const state = this.mustGet(operationId);
    state.status = 'running';
    this.emitChange(operationId, 'running', state);
  }

  updateProgress(operationId: string, progress: OperationProgress): void {
    const state = this.mustGet(operationId);
    state.progress = progress;
  }

  addTaskResult(operationId: string, result: OperationTaskResult): void {
    const state = this.mustGet(operationId);
    (state.taskResults as OperationTaskResult[]).push(result);
  }

  complete(operationId: string, tokenUsage?: { input: number; output: number }): void {
    const state = this.mustGet(operationId);
    state.status = 'completed';
    state.completedAt = new Date();
    if (tokenUsage) {
      state.tokenUsage = tokenUsage;
    }
    this.emitChange(operationId, 'completed', state);
  }

  fail(operationId: string, error: string): void {
    const state = this.mustGet(operationId);
    state.status = 'failed';
    state.completedAt = new Date();
    state.error = error;
    this.emitChange(operationId, 'failed', state);
  }

  cancel(operationId: string): void {
    const state = this.mustGet(operationId);
    state.status = 'cancelled';
    state.completedAt = new Date();
    this.emitChange(operationId, 'cancelled', state);
  }

  get(operationId: string): OperationState | undefined {
    return this.operations.get(operationId);
  }

  list(filter?: OperationFilter): readonly OperationState[] {
    let results = [...this.operations.values()];

    if (filter?.userId) {
      results = results.filter((op) => op.userId === filter.userId);
    }
    if (filter?.domainId) {
      results = results.filter((op) => op.domainId === filter.domainId);
    }
    if (filter?.status) {
      results = results.filter((op) => op.status === filter.status);
    }
    if (filter?.offset) {
      results = results.slice(filter.offset);
    }
    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  listActive(): readonly OperationState[] {
    return [...this.operations.values()].filter(
      (op) => op.status === 'pending' || op.status === 'running',
    );
  }

  private mustGet(operationId: string): OperationState {
    const state = this.operations.get(operationId);
    if (!state) {
      throw new Error(`Operation not found: ${operationId}`);
    }
    return state;
  }

  private emitChange(operationId: string, status: OperationStatus, state: OperationState): void {
    this.events.onStatusChange?.(operationId, status, state);
  }
}
