import type {
  ILlmProvider,
  Message,
  LlmResponse,
  StreamEvent,
  ToolDescription,
  AgentLogger,
} from '@cli-agent/core';
import { ProviderError, createChildLogger } from '@cli-agent/core';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  readonly baseDelayMs?: number;
  /** Maximum delay in ms (default: 30000) */
  readonly maxDelayMs?: number;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('too many requests') ||
      msg.includes('overloaded') ||
      msg.includes('529') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('socket hang up') ||
      msg.includes('503') ||
      msg.includes('500')
    );
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('econnreset') ||
      msg.includes('etimedout') ||
      msg.includes('socket hang up') ||
      msg.includes('fetch failed')
    );
  }

  return false;
}

function computeDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, maxMs);
}

/**
 * Wraps an ILlmProvider with retry logic and exponential backoff.
 * Retries on rate limits, transient network errors, and server errors.
 */
export class RetryProvider implements ILlmProvider {
  readonly providerId: string;
  private readonly inner: ILlmProvider;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly logger: AgentLogger;

  constructor(provider: ILlmProvider, config?: RetryConfig) {
    this.inner = provider;
    this.providerId = provider.providerId;
    this.maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseDelayMs = config?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.logger = createChildLogger('retry-provider');
  }

  async chat(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): Promise<LlmResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.inner.chat(messages, tools);
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries && isRetryable(error)) {
          const delay = computeDelay(attempt, this.baseDelayMs, this.maxDelayMs);
          this.logger.warn(
            { attempt: attempt + 1, maxRetries: this.maxRetries, delayMs: Math.round(delay) },
            'Retrying after transient error'
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  async *stream(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): AsyncIterable<StreamEvent> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        yield* this.inner.stream(messages, tools);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries && isRetryable(error)) {
          const delay = computeDelay(attempt, this.baseDelayMs, this.maxDelayMs);
          this.logger.warn(
            { attempt: attempt + 1, maxRetries: this.maxRetries, delayMs: Math.round(delay) },
            'Retrying stream after transient error'
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }
}
