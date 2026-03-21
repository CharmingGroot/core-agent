import { describe, it, expect, beforeEach } from 'vitest';
import { MessageManager } from '../src/message-manager.js';

describe('MessageManager', () => {
  let manager: MessageManager;

  beforeEach(() => {
    manager = new MessageManager();
  });

  it('should start empty', () => {
    expect(manager.messageCount).toBe(0);
    expect(manager.getMessages()).toEqual([]);
  });

  it('should add system message', () => {
    manager.addSystemMessage('You are helpful.');
    expect(manager.messageCount).toBe(1);
    const msgs = manager.getMessages();
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toBe('You are helpful.');
  });

  it('should add user message', () => {
    manager.addUserMessage('Hello');
    const msgs = manager.getMessages();
    expect(msgs[0]?.role).toBe('user');
    expect(msgs[0]?.content).toBe('Hello');
  });

  it('should add assistant message', () => {
    manager.addAssistantMessage('Hi there!');
    const msgs = manager.getMessages();
    expect(msgs[0]?.role).toBe('assistant');
    expect(msgs[0]?.content).toBe('Hi there!');
  });

  it('should add assistant message with tool calls', () => {
    const toolCalls = [
      { id: 'tc-1', name: 'file_read', arguments: '{"path":"test.txt"}' },
    ];
    manager.addAssistantMessage('Let me read that.', toolCalls);
    const msgs = manager.getMessages();
    expect(msgs[0]?.toolCalls).toHaveLength(1);
    expect(msgs[0]?.toolCalls?.[0]?.name).toBe('file_read');
  });

  it('should add tool results', () => {
    const results = new Map([
      ['tc-1', { success: true, output: 'file content' }],
    ]);
    manager.addToolResults(results);
    const msgs = manager.getMessages();
    expect(msgs[0]?.toolResults).toHaveLength(1);
    expect(msgs[0]?.toolResults?.[0]?.toolCallId).toBe('tc-1');
    expect(msgs[0]?.toolResults?.[0]?.content).toBe('file content');
  });

  it('should format error tool results', () => {
    const results = new Map([
      ['tc-1', { success: false, output: '', error: 'File not found' }],
    ]);
    manager.addToolResults(results);
    const msgs = manager.getMessages();
    expect(msgs[0]?.toolResults?.[0]?.content).toContain('Error: File not found');
  });

  it('should return last message', () => {
    manager.addUserMessage('first');
    manager.addAssistantMessage('second');
    expect(manager.getLastMessage()?.content).toBe('second');
  });

  it('should return undefined for empty last message', () => {
    expect(manager.getLastMessage()).toBeUndefined();
  });

  it('should clear all messages', () => {
    manager.addUserMessage('hello');
    manager.addAssistantMessage('hi');
    manager.clear();
    expect(manager.messageCount).toBe(0);
  });

  it('should not compress when under budget', () => {
    manager.addSystemMessage('system');
    manager.addUserMessage('hello');
    manager.addAssistantMessage('hi');
    const compressed = manager.compressIfNeeded();
    expect(compressed).toBe(0);
    expect(manager.messageCount).toBe(3);
  });

  it('should compress when over budget', () => {
    // Use a manager with very low token limit to force compression
    const small = new MessageManager({ maxHistoryTokens: 50, keepRecentMessages: 2 });
    small.addSystemMessage('system');
    // Add many messages to exceed 50 tokens
    for (let i = 0; i < 20; i++) {
      small.addUserMessage(`User message number ${i} with some extra content to add tokens`);
      small.addAssistantMessage(`Response number ${i} with detailed explanation text`);
    }
    const before = small.messageCount;
    const compressed = small.compressIfNeeded();
    expect(compressed).toBeGreaterThan(0);
    expect(small.messageCount).toBeLessThan(before);
    // System message preserved
    const msgs = small.getMessages();
    expect(msgs[0]?.role).toBe('system');
    // Summary message present
    expect(msgs[1]?.content).toContain('Context summary');
  });

  it('should preserve system messages during compression', () => {
    const small = new MessageManager({ maxHistoryTokens: 30, keepRecentMessages: 2 });
    small.addSystemMessage('You are helpful.');
    for (let i = 0; i < 15; i++) {
      small.addUserMessage(`msg ${i} ${'x'.repeat(50)}`);
      small.addAssistantMessage(`reply ${i} ${'y'.repeat(50)}`);
    }
    small.compressIfNeeded();
    const msgs = small.getMessages();
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toBe('You are helpful.');
  });

  it('should replace existing system message with setSystemMessage', () => {
    manager.addSystemMessage('Original prompt');
    manager.addUserMessage('hello');
    manager.setSystemMessage('Updated prompt');
    const msgs = manager.getMessages();
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toBe('Updated prompt');
    expect(manager.messageCount).toBe(2); // no extra message added
  });

  it('should insert system message at position 0 if none exists', () => {
    manager.addUserMessage('hello');
    manager.setSystemMessage('Injected prompt');
    const msgs = manager.getMessages();
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toBe('Injected prompt');
    expect(msgs[1]?.role).toBe('user');
    expect(manager.messageCount).toBe(2);
  });

  it('should serialize and restore messages', () => {
    manager.addSystemMessage('You are helpful.');
    manager.addUserMessage('Hello');
    manager.addAssistantMessage('Hi!', [
      { id: 'tc-1', name: 'file_read', arguments: '{"path":"a.txt"}' },
    ]);

    const json = manager.serialize();
    const restored = new MessageManager();
    restored.restore(json);

    expect(restored.messageCount).toBe(3);
    const msgs = restored.getMessages();
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[1]?.content).toBe('Hello');
    expect(msgs[2]?.toolCalls?.[0]?.name).toBe('file_read');
  });

  it('should clear existing messages on restore', () => {
    manager.addUserMessage('old');
    manager.restore(JSON.stringify([{ role: 'user', content: 'new' }]));
    expect(manager.messageCount).toBe(1);
    expect(manager.getMessages()[0]?.content).toBe('new');
  });

  it('should throw on invalid serialized data', () => {
    expect(() => manager.restore('"not an array"')).toThrow('expected an array');
  });

  it('should skip malformed entries during restore', () => {
    const json = JSON.stringify([
      { role: 'user', content: 'valid' },
      { bad: 'entry' },
      { role: 123, content: 'invalid role' },
    ]);
    manager.restore(json);
    expect(manager.messageCount).toBe(1);
    expect(manager.getMessages()[0]?.content).toBe('valid');
  });

  it('should return a copy of messages', () => {
    manager.addUserMessage('hello');
    const msgs = manager.getMessages();
    expect(msgs).toHaveLength(1);
    // Adding more shouldn't affect returned array
    manager.addUserMessage('world');
    expect(msgs).toHaveLength(1);
  });
});
