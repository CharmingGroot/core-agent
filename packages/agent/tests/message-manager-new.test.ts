import { describe, it, expect, beforeEach } from 'vitest';
import { MessageManager } from '../src/message-manager.js';
import type { Message } from '@cli-agent/core';

describe('MessageManager — 기본 동작', () => {
  let manager: MessageManager;

  beforeEach(() => {
    manager = new MessageManager();
  });

  it('초기 상태는 메시지가 없다', () => {
    expect(manager.messageCount).toBe(0);
    expect(manager.getMessages()).toHaveLength(0);
  });

  it('user 메시지를 추가하고 반환한다', () => {
    manager.addUserMessage('hello');
    const msgs = manager.getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('hello');
  });

  it('assistant 메시지를 tool call과 함께 추가한다', () => {
    manager.addAssistantMessage('running tool', [
      { id: 'tc1', name: 'get_schema', arguments: '{}' },
    ]);
    const msg = manager.getMessages()[0];
    expect(msg.role).toBe('assistant');
    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0].name).toBe('get_schema');
  });

  it('tool result를 추가한다', () => {
    manager.addToolResults(
      new Map([['tc1', { success: true, output: '{"table":"users"}' }]])
    );
    const msg = manager.getMessages()[0];
    expect(msg.toolResults).toHaveLength(1);
    expect(msg.toolResults![0].content).toBe('{"table":"users"}');
  });

  it('tool 실패 결과를 Error: 접두사와 함께 저장한다', () => {
    manager.addToolResults(
      new Map([['tc1', { success: false, error: 'connection refused' }]])
    );
    const msg = manager.getMessages()[0];
    expect(msg.toolResults![0].content).toBe('Error: connection refused');
  });

  it('setSystemMessage는 첫 system 메시지를 교체한다', () => {
    manager.addSystemMessage('original');
    manager.setSystemMessage('updated');
    const msgs = manager.getMessages();
    expect(msgs.filter(m => m.role === 'system')).toHaveLength(1);
    expect(msgs[0].content).toBe('updated');
  });

  it('setSystemMessage는 system 메시지가 없으면 맨 앞에 삽입한다', () => {
    manager.addUserMessage('first user');
    manager.setSystemMessage('system prompt');
    expect(manager.getMessages()[0].role).toBe('system');
  });

  it('clear() 후 메시지가 없다', () => {
    manager.addUserMessage('hello');
    manager.clear();
    expect(manager.messageCount).toBe(0);
  });

  it('getLastMessage()는 마지막 메시지를 반환한다', () => {
    manager.addUserMessage('first');
    manager.addUserMessage('last');
    expect(manager.getLastMessage()?.content).toBe('last');
  });

  it('getMessages()는 불변 복사본을 반환한다', () => {
    manager.addUserMessage('original');
    const msgs = manager.getMessages() as Message[];
    msgs.push({ role: 'user', content: 'injected' });
    expect(manager.messageCount).toBe(1);
  });
});

describe('MessageManager — 토큰 카운팅', () => {
  it('totalTokens는 빈 상태에서 양수를 반환한다 (reply overhead)', () => {
    const manager = new MessageManager();
    expect(manager.totalTokens).toBeGreaterThanOrEqual(3);
  });

  it('메시지 추가 시 totalTokens가 증가한다', () => {
    const manager = new MessageManager();
    const before = manager.totalTokens;
    manager.addUserMessage('this is a test message with some content');
    expect(manager.totalTokens).toBeGreaterThan(before);
  });
});

describe('MessageManager — serialize / restore', () => {
  it('직렬화 후 복원하면 동일한 메시지를 반환한다', () => {
    const manager = new MessageManager();
    manager.addSystemMessage('you are a helpful assistant');
    manager.addUserMessage('hello');
    manager.addAssistantMessage('hi there', [
      { id: 'tc1', name: 'search', arguments: '{"q":"test"}' },
    ]);

    const json = manager.serialize();
    const restored = new MessageManager();
    restored.restore(json);

    expect(restored.messageCount).toBe(manager.messageCount);
    expect(restored.getMessages()[0].content).toBe('you are a helpful assistant');
    expect(restored.getMessages()[2].toolCalls![0].name).toBe('search');
  });

  it('잘못된 JSON으로 restore하면 예외를 던진다', () => {
    const manager = new MessageManager();
    expect(() => manager.restore('not-json')).toThrow();
  });

  it('배열이 아닌 JSON으로 restore하면 예외를 던진다', () => {
    const manager = new MessageManager();
    expect(() => manager.restore('{"key":"value"}')).toThrow('expected an array');
  });
});

describe('MessageManager — compressIfNeeded', () => {
  it('토큰이 budget 이하이면 압축하지 않는다', () => {
    const manager = new MessageManager({ maxHistoryTokens: 100_000 });
    manager.addUserMessage('short message');
    expect(manager.compressIfNeeded()).toBe(0);
  });

  it('budget 초과 시 압축하고 압축된 메시지 수를 반환한다', () => {
    // 아주 작은 budget으로 강제 압축
    const manager = new MessageManager({
      maxHistoryTokens: 10,
      keepRecentMessages: 2,
    });
    for (let i = 0; i < 6; i++) {
      manager.addUserMessage(`message number ${i} with some content to push token count up`);
    }
    const compressed = manager.compressIfNeeded();
    expect(compressed).toBeGreaterThan(0);
  });

  it('압축 후 system 메시지는 유지된다', () => {
    const manager = new MessageManager({
      maxHistoryTokens: 10,
      keepRecentMessages: 2,
    });
    manager.addSystemMessage('system prompt must survive');
    for (let i = 0; i < 5; i++) {
      manager.addUserMessage(`message ${i} with enough content to exceed the tiny budget`);
    }
    manager.compressIfNeeded();
    const msgs = manager.getMessages();
    expect(msgs.some(m => m.role === 'system' && m.content === 'system prompt must survive')).toBe(true);
  });

  it('압축 후 최근 메시지는 원본 그대로 유지된다', () => {
    const manager = new MessageManager({
      maxHistoryTokens: 10,
      keepRecentMessages: 2,
    });
    for (let i = 0; i < 4; i++) {
      manager.addUserMessage(`message ${i} padding content to exceed the token budget limit`);
    }
    manager.addUserMessage('KEEP THIS ONE');
    manager.addUserMessage('AND THIS ONE');

    manager.compressIfNeeded();

    const msgs = manager.getMessages();
    const kept = msgs.filter(m => m.role !== 'system' && !m.content.includes('[Context summary'));
    expect(kept.some(m => m.content === 'KEEP THIS ONE')).toBe(true);
    expect(kept.some(m => m.content === 'AND THIS ONE')).toBe(true);
  });

  it('다이제스트에 압축된 메시지 수가 표시된다', () => {
    const manager = new MessageManager({
      maxHistoryTokens: 10,
      keepRecentMessages: 1,
    });
    for (let i = 0; i < 4; i++) {
      manager.addUserMessage(`message ${i} with padding content to force compression of history`);
    }
    manager.compressIfNeeded();

    const msgs = manager.getMessages();
    const summary = msgs.find(m => m.content.includes('[Context summary'));
    expect(summary).toBeDefined();
    expect(summary!.content).toMatch(/\d+ earlier messages compressed/);
  });

  it('압축할 메시지가 없으면 0을 반환한다', () => {
    const manager = new MessageManager({ maxHistoryTokens: 10, keepRecentMessages: 10 });
    manager.addUserMessage('only message');
    // keepRecentMessages >= total → nothing to summarize
    expect(manager.compressIfNeeded()).toBe(0);
  });
});
