import { describe, it, expect, vi } from 'vitest';
import { RetryProvider } from '../src/retry-provider.js';
import type { ILlmProvider, LlmResponse, StreamEvent } from '@cli-agent/core';
import { ProviderError } from '@cli-agent/core';

const MOCK_RESPONSE: LlmResponse = {
  content: 'Hello',
  stopReason: 'end_turn',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
};

function createMockProvider(overrides?: Partial<ILlmProvider>): ILlmProvider {
  return {
    providerId: 'mock',
    chat: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    async *stream() {
      yield { type: 'done', response: MOCK_RESPONSE } as StreamEvent;
    },
    ...overrides,
  };
}

describe('RetryProvider', () => {
  it('should pass through successful calls', async () => {
    const inner = createMockProvider();
    const retry = new RetryProvider(inner);

    const result = await retry.chat([], []);
    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(1);
  });

  it('should retry on rate limit errors', async () => {
    const inner = createMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('rate limit exceeded (429)'))
        .mockResolvedValueOnce(MOCK_RESPONSE),
    });
    const retry = new RetryProvider(inner, { baseDelayMs: 10 });

    const result = await retry.chat([], []);
    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(2);
  });

  it('should retry on transient network errors', async () => {
    const inner = createMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('ECONNRESET'))
        .mockResolvedValueOnce(MOCK_RESPONSE),
    });
    const retry = new RetryProvider(inner, { baseDelayMs: 10 });

    const result = await retry.chat([], []);
    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(2);
  });

  it('should not retry on non-retryable errors', async () => {
    const inner = createMockProvider({
      chat: vi.fn().mockRejectedValue(new ProviderError('Invalid API key')),
    });
    const retry = new RetryProvider(inner, { baseDelayMs: 10 });

    await expect(retry.chat([], [])).rejects.toThrow('Invalid API key');
    expect(inner.chat).toHaveBeenCalledTimes(1);
  });

  it('should give up after maxRetries', async () => {
    const inner = createMockProvider({
      chat: vi.fn().mockRejectedValue(new ProviderError('rate limit exceeded (429)')),
    });
    const retry = new RetryProvider(inner, { maxRetries: 2, baseDelayMs: 10 });

    await expect(retry.chat([], [])).rejects.toThrow('rate limit');
    expect(inner.chat).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should preserve providerId', () => {
    const inner = createMockProvider();
    const retry = new RetryProvider(inner);
    expect(retry.providerId).toBe('mock');
  });

  it('should retry on overloaded errors', async () => {
    const inner = createMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('overloaded (529)'))
        .mockResolvedValueOnce(MOCK_RESPONSE),
    });
    const retry = new RetryProvider(inner, { baseDelayMs: 10 });

    const result = await retry.chat([], []);
    expect(result).toBe(MOCK_RESPONSE);
  });

  it('should retry stream on transient errors', async () => {
    let attempt = 0;
    const inner = createMockProvider({
      async *stream() {
        attempt++;
        if (attempt === 1) {
          throw new ProviderError('socket hang up');
        }
        yield { type: 'done', response: MOCK_RESPONSE } as StreamEvent;
      },
    });
    const retry = new RetryProvider(inner, { baseDelayMs: 10 });

    const events: StreamEvent[] = [];
    for await (const event of retry.stream([], [])) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('done');
  });
});
