import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryProvider } from '../src/retry-provider.js';
import { ProviderError } from '@cli-agent/core';
import type { ILlmProvider, LlmResponse, Message } from '@cli-agent/core';

const MOCK_RESPONSE: LlmResponse = {
  content: 'test response',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  stopReason: 'end_turn',
};

function makeMockProvider(impl?: Partial<ILlmProvider>): ILlmProvider {
  return {
    providerId: 'mock',
    chat: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    stream: vi.fn().mockImplementation(async function* () { yield* []; }),
    ...impl,
  };
}

const MESSAGES: Message[] = [{ role: 'user', content: 'hello' }];

describe('RetryProvider — chat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('첫 번째 시도에 성공하면 바로 반환한다', async () => {
    const inner = makeMockProvider();
    const provider = new RetryProvider(inner, { maxRetries: 3 });

    const result = await provider.chat(MESSAGES);
    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(1);
  });

  it('rate limit(429) 에러 시 재시도한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('429 rate limit exceeded'))
        .mockResolvedValue(MOCK_RESPONSE),
    });
    const provider = new RetryProvider(inner, { maxRetries: 3, baseDelayMs: 0 });

    const promise = provider.chat(MESSAGES);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(2);
  });

  it('서버 에러(500) 시 재시도한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('500 internal server error'))
        .mockResolvedValue(MOCK_RESPONSE),
    });
    const provider = new RetryProvider(inner, { maxRetries: 3, baseDelayMs: 0 });

    const promise = provider.chat(MESSAGES);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(2);
  });

  it('네트워크 에러(econnreset) 시 재시도한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET connection reset'))
        .mockResolvedValue(MOCK_RESPONSE),
    });
    const provider = new RetryProvider(inner, { maxRetries: 3, baseDelayMs: 0 });

    const promise = provider.chat(MESSAGES);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(MOCK_RESPONSE);
    expect(inner.chat).toHaveBeenCalledTimes(2);
  });

  it('재시도 불가 에러(400)는 즉시 던진다', async () => {
    const error = new ProviderError('400 bad request invalid input');
    const inner = makeMockProvider({
      chat: vi.fn().mockRejectedValue(error),
    });
    const provider = new RetryProvider(inner, { maxRetries: 3, baseDelayMs: 0 });

    await expect(provider.chat(MESSAGES)).rejects.toThrow('400 bad request');
    expect(inner.chat).toHaveBeenCalledTimes(1);
  });

  it('maxRetries 소진 후 마지막 에러를 던진다', async () => {
    const error = new ProviderError('overloaded');
    const inner = makeMockProvider({
      chat: vi.fn().mockRejectedValue(error),
    });
    const provider = new RetryProvider(inner, { maxRetries: 2, baseDelayMs: 0 });

    const promise = provider.chat(MESSAGES);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('overloaded');
    expect(inner.chat).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('providerId를 inner provider로부터 위임한다', () => {
    const inner = makeMockProvider();
    const provider = new RetryProvider(inner);
    expect(provider.providerId).toBe('mock');
  });
});

describe('RetryProvider — stream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('stream이 성공하면 이벤트를 그대로 반환한다', async () => {
    const inner = makeMockProvider({
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'text_delta' as const, text: 'hello' };
        yield { type: 'done' as const, response: MOCK_RESPONSE };
      }),
    });
    const provider = new RetryProvider(inner, { maxRetries: 2, baseDelayMs: 0 });

    const events = [];
    for await (const event of provider.stream(MESSAGES)) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'text_delta', text: 'hello' });
  });

  it('stream에서 재시도 가능 에러 발생 시 재시도한다', async () => {
    let callCount = 0;
    const inner = makeMockProvider({
      stream: vi.fn().mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) throw new ProviderError('503 service unavailable');
        yield { type: 'done' as const, response: MOCK_RESPONSE };
      }),
    });
    const provider = new RetryProvider(inner, { maxRetries: 2, baseDelayMs: 0 });

    const promise = (async () => {
      const events = [];
      for await (const event of provider.stream(MESSAGES)) {
        events.push(event);
      }
      return events;
    })();

    await vi.runAllTimersAsync();
    const events = await promise;

    expect(callCount).toBe(2);
    expect(events).toHaveLength(1);
  });
});
