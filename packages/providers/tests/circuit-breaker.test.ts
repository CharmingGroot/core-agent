import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreakerProvider } from '../src/circuit-breaker.js';
import { ProviderError } from '@cli-agent/core';
import type { ILlmProvider, LlmResponse, Message } from '@cli-agent/core';

const MOCK_RESPONSE: LlmResponse = {
  content: 'ok',
  toolCalls: [],
  usage: { inputTokens: 5, outputTokens: 3 },
  stopReason: 'end_turn',
};

const MESSAGES: Message[] = [{ role: 'user', content: 'test' }];

function makeMockProvider(impl?: Partial<ILlmProvider>): ILlmProvider {
  return {
    providerId: 'mock',
    chat: vi.fn().mockResolvedValue(MOCK_RESPONSE),
    stream: vi.fn().mockImplementation(async function* () { yield* []; }),
    ...impl,
  };
}

describe('CircuitBreakerProvider — 상태 전이', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('초기 상태는 CLOSED다', () => {
    const cb = new CircuitBreakerProvider(makeMockProvider());
    expect(cb.currentState).toBe('CLOSED');
  });

  it('성공 시 CLOSED 상태를 유지한다', async () => {
    const cb = new CircuitBreakerProvider(makeMockProvider());
    await cb.chat(MESSAGES);
    expect(cb.currentState).toBe('CLOSED');
  });

  it('failureThreshold 연속 실패 시 OPEN으로 전이한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn().mockRejectedValue(new ProviderError('server error 500')),
    });
    const cb = new CircuitBreakerProvider(inner, { failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await cb.chat(MESSAGES).catch(() => {});
    }

    expect(cb.currentState).toBe('OPEN');
  });

  it('OPEN 상태에서 즉시 ProviderError를 던진다 (실제 provider 호출 없음)', async () => {
    const inner = makeMockProvider({
      chat: vi.fn().mockRejectedValue(new ProviderError('error')),
    });
    const cb = new CircuitBreakerProvider(inner, {
      failureThreshold: 2,
      openTimeoutMs: 10_000,
    });

    // OPEN으로 만들기
    for (let i = 0; i < 2; i++) {
      await cb.chat(MESSAGES).catch(() => {});
    }
    expect(cb.currentState).toBe('OPEN');

    const callsBefore = (inner.chat as ReturnType<typeof vi.fn>).mock.calls.length;
    await expect(cb.chat(MESSAGES)).rejects.toThrow('Circuit breaker OPEN');
    // inner provider는 호출되지 않아야 함
    expect((inner.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('openTimeoutMs 경과 후 HALF_OPEN으로 전이한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('error'))
        .mockRejectedValueOnce(new ProviderError('error'))
        .mockResolvedValue(MOCK_RESPONSE), // probe 성공
    });
    const cb = new CircuitBreakerProvider(inner, {
      failureThreshold: 2,
      openTimeoutMs: 5_000,
      successThreshold: 1,
    });

    for (let i = 0; i < 2; i++) {
      await cb.chat(MESSAGES).catch(() => {});
    }
    expect(cb.currentState).toBe('OPEN');

    vi.advanceTimersByTime(5_001);

    // probe 요청 — 성공 → CLOSED
    await cb.chat(MESSAGES);
    expect(cb.currentState).toBe('CLOSED');
  });

  it('HALF_OPEN에서 probe 실패 시 OPEN으로 돌아간다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn().mockRejectedValue(new ProviderError('error')),
    });
    const cb = new CircuitBreakerProvider(inner, {
      failureThreshold: 2,
      openTimeoutMs: 1_000,
    });

    for (let i = 0; i < 2; i++) {
      await cb.chat(MESSAGES).catch(() => {});
    }

    vi.advanceTimersByTime(1_001);
    // HALF_OPEN probe → 실패 → OPEN
    await cb.chat(MESSAGES).catch(() => {});
    expect(cb.currentState).toBe('OPEN');
  });

  it('HALF_OPEN에서 successThreshold 성공 시 CLOSED로 전이한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('err'))
        .mockRejectedValueOnce(new ProviderError('err'))
        .mockResolvedValue(MOCK_RESPONSE),
    });
    const cb = new CircuitBreakerProvider(inner, {
      failureThreshold: 2,
      openTimeoutMs: 1_000,
      successThreshold: 2,
    });

    for (let i = 0; i < 2; i++) {
      await cb.chat(MESSAGES).catch(() => {});
    }
    expect(cb.currentState).toBe('OPEN');

    vi.advanceTimersByTime(1_001);

    // 첫 번째 성공 → HALF_OPEN 유지
    await cb.chat(MESSAGES);
    expect(cb.currentState).toBe('HALF_OPEN');

    // 두 번째 성공 → CLOSED
    await cb.chat(MESSAGES);
    expect(cb.currentState).toBe('CLOSED');
  });

  it('CLOSED에서 성공하면 failureCount를 리셋한다', async () => {
    const inner = makeMockProvider({
      chat: vi.fn()
        .mockRejectedValueOnce(new ProviderError('err'))  // call 1: fail
        .mockRejectedValueOnce(new ProviderError('err'))  // call 2: fail
        .mockResolvedValueOnce(MOCK_RESPONSE)              // call 3: success → reset
        .mockRejectedValueOnce(new ProviderError('err'))  // call 4: fail
        .mockRejectedValueOnce(new ProviderError('err'))  // call 5: fail
        .mockResolvedValue(MOCK_RESPONSE),                 // default
    });
    const cb = new CircuitBreakerProvider(inner, { failureThreshold: 3 });

    // 2번 실패
    await cb.chat(MESSAGES).catch(() => {});
    await cb.chat(MESSAGES).catch(() => {});
    expect(cb.currentState).toBe('CLOSED');

    // 성공 → failure count reset
    await cb.chat(MESSAGES);
    expect(cb.currentState).toBe('CLOSED');

    // 다시 2번 실패해도 OPEN이 되지 않음 (threshold 3 기준)
    await cb.chat(MESSAGES).catch(() => {});
    await cb.chat(MESSAGES).catch(() => {});
    expect(cb.currentState).toBe('CLOSED');
  });

  it('providerId를 inner provider로부터 위임한다', () => {
    const cb = new CircuitBreakerProvider(makeMockProvider());
    expect(cb.providerId).toBe('mock');
  });
});

describe('CircuitBreakerProvider — stream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('CLOSED 상태에서 stream이 정상 동작한다', async () => {
    const inner = makeMockProvider({
      stream: vi.fn().mockImplementation(async function* () {
        yield { type: 'text_delta' as const, text: 'hello' };
        yield { type: 'done' as const, response: MOCK_RESPONSE };
      }),
    });
    const cb = new CircuitBreakerProvider(inner);

    const events = [];
    for await (const e of cb.stream(MESSAGES)) {
      events.push(e);
    }
    expect(events).toHaveLength(2);
    expect(cb.currentState).toBe('CLOSED');
  });

  it('stream 실패가 failureCount에 반영된다', async () => {
    const inner = makeMockProvider({
      stream: vi.fn().mockImplementation(async function* () {
        throw new ProviderError('stream error');
      }),
    });
    const cb = new CircuitBreakerProvider(inner, { failureThreshold: 2 });

    for (let i = 0; i < 2; i++) {
      try {
        for await (const _ of cb.stream(MESSAGES)) { /* empty */ }
      } catch { /* expected */ }
    }
    expect(cb.currentState).toBe('OPEN');
  });
});
