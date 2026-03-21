import type {
  ILlmProvider,
  Message,
  LlmResponse,
  StreamEvent,
  ToolDescription,
  AgentLogger,
} from '@cli-agent/core';
import { ProviderError, createChildLogger } from '@cli-agent/core';

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Consecutive successes in HALF_OPEN to close the circuit (default: 2) */
  successThreshold?: number;
  /** Ms to stay OPEN before allowing a probe request (default: 60_000) */
  openTimeoutMs?: number;
}

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker wrapping an ILlmProvider.
 *
 * CLOSED  → normal operation, counts failures
 * OPEN    → rejects immediately, waits openTimeoutMs then probes
 * HALF_OPEN → allows one request; success → CLOSED, failure → OPEN
 *
 * Wrap inside RetryProvider for best results:
 *   createProvider() → RetryProvider → CircuitBreakerProvider
 */
export class CircuitBreakerProvider implements ILlmProvider {
  readonly providerId: string;

  private readonly inner: ILlmProvider;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly openTimeoutMs: number;
  private readonly logger: AgentLogger;

  private state: State = 'CLOSED';
  private failureCount  = 0;
  private successCount  = 0;
  private openedAt      = 0;

  constructor(provider: ILlmProvider, config?: CircuitBreakerConfig) {
    this.inner            = provider;
    this.providerId       = provider.providerId;
    this.failureThreshold = config?.failureThreshold ?? 5;
    this.successThreshold = config?.successThreshold ?? 2;
    this.openTimeoutMs    = config?.openTimeoutMs    ?? 60_000;
    this.logger           = createChildLogger('circuit-breaker');
  }

  get currentState(): State {
    return this.state;
  }

  async chat(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): Promise<LlmResponse> {
    this.guardOrThrow();
    try {
      const result = await this.inner.chat(messages, tools);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  async *stream(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): AsyncIterable<StreamEvent> {
    this.guardOrThrow();
    try {
      yield* this.inner.stream(messages, tools);
      this.onSuccess();
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  // ── Internal state machine ───────────────────────────────────────────────

  private guardOrThrow(): void {
    if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') return;

    // OPEN: check if timeout has elapsed
    const elapsed = Date.now() - this.openedAt;
    if (elapsed >= this.openTimeoutMs) {
      this.transitionTo('HALF_OPEN');
      return; // allow this probe request through
    }

    const remaining = Math.ceil((this.openTimeoutMs - elapsed) / 1000);
    throw new ProviderError(
      `Circuit breaker OPEN for provider '${this.providerId}' — retry in ${remaining}s`
    );
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo('CLOSED');
      }
    } else {
      this.failureCount = 0; // reset on any success in CLOSED
    }
  }

  private onFailure(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    this.logger.warn({ state: this.state, error: msg }, 'Circuit breaker recorded failure');

    if (this.state === 'HALF_OPEN') {
      // Probe failed → back to OPEN
      this.transitionTo('OPEN');
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(next: State): void {
    const prev = this.state;
    this.state = next;

    if (next === 'OPEN') {
      this.openedAt     = Date.now();
      this.successCount = 0;
      this.logger.error(
        { failureCount: this.failureCount, openTimeoutMs: this.openTimeoutMs },
        `Circuit breaker OPENED for provider '${this.providerId}'`
      );
    } else if (next === 'HALF_OPEN') {
      this.successCount = 0;
      this.logger.warn({}, `Circuit breaker HALF_OPEN — probing provider '${this.providerId}'`);
    } else {
      this.failureCount = 0;
      this.logger.info({}, `Circuit breaker CLOSED for provider '${this.providerId}'`);
    }

    if (prev !== next) {
      // Allow external inspection of state transitions
      this.logger.debug({ from: prev, to: next }, 'Circuit breaker state transition');
    }
  }
}
