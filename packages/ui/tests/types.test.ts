import { describe, it, expect } from 'vitest';
import type { ChatMessage, ToolCallDisplay, AppConfig, AppView } from '../src/renderer/types.js';

describe('UI Types', () => {
  it('should create a valid ChatMessage', () => {
    const msg: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date(),
    };
    expect(msg.id).toBe('msg-1');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello');
  });

  it('should create a ChatMessage with tool calls', () => {
    const toolCall: ToolCallDisplay = {
      id: 'tc-1',
      name: 'file_read',
      arguments: '{"path":"test.txt"}',
      status: 'success',
      result: 'file content',
    };

    const msg: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'I read the file.',
      timestamp: new Date(),
      toolCalls: [toolCall],
      iterations: 2,
      tokenUsage: { input: 100, output: 50 },
    };

    expect(msg.toolCalls).toHaveLength(1);
    expect(msg.toolCalls![0]!.name).toBe('file_read');
    expect(msg.iterations).toBe(2);
  });

  it('should support all tool call statuses', () => {
    const statuses: Array<ToolCallDisplay['status']> = ['running', 'success', 'error'];
    for (const status of statuses) {
      const tc: ToolCallDisplay = {
        id: 'tc-1',
        name: 'test',
        arguments: '{}',
        status,
      };
      expect(tc.status).toBe(status);
    }
  });

  it('should create a valid AppConfig', () => {
    const config: AppConfig = {
      providerId: 'claude',
      model: 'claude-sonnet-4-6',
      apiKey: 'test-key',
      maxTokens: 4096,
      temperature: 0.7,
      workingDirectory: '/tmp',
    };
    expect(config.providerId).toBe('claude');
  });

  it('should support all AppView types', () => {
    const views: AppView[] = ['chat', 'settings'];
    expect(views).toHaveLength(2);
  });

  it('should allow optional fields on ChatMessage', () => {
    const msg: ChatMessage = {
      id: 'msg-3',
      role: 'assistant',
      content: 'Simple response',
      timestamp: new Date(),
    };
    expect(msg.toolCalls).toBeUndefined();
    expect(msg.iterations).toBeUndefined();
    expect(msg.tokenUsage).toBeUndefined();
  });

  it('should allow optional fields on ToolCallDisplay', () => {
    const tc: ToolCallDisplay = {
      id: 'tc-2',
      name: 'shell_exec',
      arguments: '{"command":"ls"}',
      status: 'running',
    };
    expect(tc.result).toBeUndefined();
    expect(tc.error).toBeUndefined();
    expect(tc.durationMs).toBeUndefined();
  });

  it('should allow optional fields on AppConfig', () => {
    const config: AppConfig = {
      providerId: 'openai',
      model: 'gpt-4',
      apiKey: 'key',
      maxTokens: 2048,
      temperature: 0.5,
      workingDirectory: '.',
    };
    expect(config.baseUrl).toBeUndefined();
    expect(config.systemPrompt).toBeUndefined();
  });
});
