import { describe, it, expect } from 'vitest';
import {
  countTextTokens,
  countMessageTokens,
  countHistoryTokens,
} from '../src/token-counter.js';
import type { Message } from '@cli-agent/core';

describe('countTextTokens', () => {
  it('빈 문자열은 0을 반환한다', () => {
    expect(countTextTokens('')).toBe(0);
  });

  it('짧은 텍스트에서 양수를 반환한다', () => {
    expect(countTextTokens('hello world')).toBeGreaterThan(0);
  });

  it('긴 텍스트일수록 토큰 수가 많다', () => {
    const short = countTextTokens('hello');
    const long  = countTextTokens('hello world this is a longer sentence with many more tokens in it');
    expect(long).toBeGreaterThan(short);
  });

  it('동일한 입력에 대해 일관된 결과를 반환한다', () => {
    const text = 'consistent token count test';
    expect(countTextTokens(text)).toBe(countTextTokens(text));
  });
});

describe('countMessageTokens', () => {
  it('content가 있는 user 메시지를 카운트한다', () => {
    const msg: Message = { role: 'user', content: 'hello there' };
    expect(countMessageTokens(msg)).toBeGreaterThan(0);
  });

  it('tool call이 있는 assistant 메시지는 더 많은 토큰을 가진다', () => {
    const withoutTools: Message = {
      role: 'assistant',
      content: 'I will call a tool',
    };
    const withTools: Message = {
      role: 'assistant',
      content: 'I will call a tool',
      toolCalls: [{ id: 'tc1', name: 'get_schema', arguments: '{}' }],
    };
    expect(countMessageTokens(withTools)).toBeGreaterThan(countMessageTokens(withoutTools));
  });

  it('tool result가 있는 메시지를 카운트한다', () => {
    const msg: Message = {
      role: 'user',
      content: '',
      toolResults: [{ toolCallId: 'tc1', content: '{"table": "users"}' }],
    };
    expect(countMessageTokens(msg)).toBeGreaterThan(0);
  });

  it('overhead(4)가 항상 포함된다', () => {
    const empty: Message = { role: 'user', content: '' };
    expect(countMessageTokens(empty)).toBeGreaterThanOrEqual(4);
  });
});

describe('countHistoryTokens', () => {
  it('빈 배열은 reply overhead(3)만 반환한다', () => {
    expect(countHistoryTokens([])).toBe(3);
  });

  it('메시지가 많을수록 토큰 수가 많다', () => {
    const msgs: Message[] = [
      { role: 'user',      content: 'first message with some content' },
      { role: 'assistant', content: 'response to the first message' },
      { role: 'user',      content: 'second message with more content' },
    ];
    expect(countHistoryTokens(msgs)).toBeGreaterThan(countHistoryTokens([msgs[0]]));
  });
});
