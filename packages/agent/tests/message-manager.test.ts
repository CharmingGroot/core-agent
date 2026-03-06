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

  it('should return a copy of messages', () => {
    manager.addUserMessage('hello');
    const msgs = manager.getMessages();
    expect(msgs).toHaveLength(1);
    // Adding more shouldn't affect returned array
    manager.addUserMessage('world');
    expect(msgs).toHaveLength(1);
  });
});
