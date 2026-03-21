import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager, InMemoryStore } from '../src/index.js';

describe('MemoryManager', () => {
  let store: InMemoryStore;
  let manager: MemoryManager;

  beforeEach(() => {
    store = new InMemoryStore();
    manager = new MemoryManager({ store, shortTermSize: 3 });
  });

  it('대화 한 턴을 기록하고 단기 메모리에 저장한다', async () => {
    await manager.recordTurn(
      {
        userMessage: '이차방정식 x² + 5x + 6 = 0을 풀어줘',
        assistantResponse: '인수분해를 사용합니다. (x+2)(x+3)=0 이므로 x=-2, x=-3 입니다. **정답:** x=-2 또는 x=-3',
      },
      'session-1'
    );

    const entries = manager.getShortTermEntries('session-1');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.topic).toBe('이차방정식/이차함수');
    expect(entries[0]?.intent).toBe('문제 풀이 요청');
  });

  it('단기 메모리가 maxSize를 초과하면 오래된 항목을 제거한다', async () => {
    for (let i = 0; i < 5; i++) {
      await manager.recordTurn(
        {
          userMessage: `미분 문제 ${i}`,
          assistantResponse: `f'(x) = ${i}x 입니다.`,
        },
        'session-2'
      );
    }

    const entries = manager.getShortTermEntries('session-2');
    expect(entries).toHaveLength(3); // maxSize=3
  });

  it('augmentContext는 관련 메모리가 없으면 빈 문자열을 반환한다', async () => {
    const addon = await manager.augmentContext('미분을 설명해줘', 'session-3');
    expect(addon).toBe('');
  });

  it('augmentContext는 단기 메모리가 있으면 요약을 반환한다', async () => {
    await manager.recordTurn(
      {
        userMessage: '삼각함수 sin 값은?',
        assistantResponse: 'sin 30° = 1/2 입니다. **정답:** 1/2',
      },
      'session-4'
    );

    const addon = await manager.augmentContext('cos는요?', 'session-4');
    expect(addon).toContain('이번 대화 요약');
  });
});
