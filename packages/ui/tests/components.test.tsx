import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MessageBubble } from '../src/renderer/components/MessageBubble.js';
import { ToolResultView } from '../src/renderer/components/ToolResultView.js';
import type { ChatMessage, ToolCallDisplay } from '../src/renderer/types.js';

describe('MessageBubble', () => {
  it('should render a user message', () => {
    const msg: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello world',
      timestamp: new Date('2024-01-01T12:00:00'),
    };
    const html = renderToString(<MessageBubble message={msg} />);
    expect(html).toContain('Hello world');
    expect(html).toContain('You');
  });

  it('should render an assistant message', () => {
    const msg: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: new Date('2024-01-01T12:00:00'),
    };
    const html = renderToString(<MessageBubble message={msg} />);
    expect(html).toContain('Hi there!');
    expect(html).toContain('Assistant');
  });

  it('should render tool calls in message', () => {
    const msg: ChatMessage = {
      id: 'msg-3',
      role: 'assistant',
      content: 'Done reading.',
      timestamp: new Date('2024-01-01T12:00:00'),
      toolCalls: [
        {
          id: 'tc-1',
          name: 'file_read',
          arguments: '{"path":"test.txt"}',
          status: 'success',
          result: 'file contents here',
        },
      ],
    };
    const html = renderToString(<MessageBubble message={msg} />);
    expect(html).toContain('file_read');
    expect(html).toContain('file contents here');
  });

  it('should render iteration count', () => {
    const msg: ChatMessage = {
      id: 'msg-4',
      role: 'assistant',
      content: 'Done',
      timestamp: new Date('2024-01-01T12:00:00'),
      iterations: 3,
    };
    const html = renderToString(<MessageBubble message={msg} />);
    // React SSR inserts <!-- --> between expressions
    expect(html).toContain('3');
    expect(html).toContain('iter');
  });

  it('should handle long content with expand button', () => {
    const longContent = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n');
    const msg: ChatMessage = {
      id: 'msg-5',
      role: 'assistant',
      content: longContent,
      timestamp: new Date('2024-01-01T12:00:00'),
    };
    const html = renderToString(<MessageBubble message={msg} />);
    expect(html).toContain('lines');
  });

  it('should render error tool call', () => {
    const msg: ChatMessage = {
      id: 'msg-6',
      role: 'assistant',
      content: 'Failed',
      timestamp: new Date('2024-01-01T12:00:00'),
      toolCalls: [
        {
          id: 'tc-2',
          name: 'shell_exec',
          arguments: '{}',
          status: 'error',
          error: 'Command not found',
        },
      ],
    };
    const html = renderToString(<MessageBubble message={msg} />);
    expect(html).toContain('Command not found');
  });
});

describe('ToolResultView', () => {
  it('should render tool call list', () => {
    const toolCalls: ToolCallDisplay[] = [
      {
        id: 'tc-1',
        name: 'file_read',
        arguments: '{"path":"a.txt"}',
        status: 'success',
        result: 'content A',
      },
      {
        id: 'tc-2',
        name: 'file_write',
        arguments: '{"path":"b.txt","content":"hello"}',
        status: 'success',
        result: 'File written',
      },
    ];
    const html = renderToString(<ToolResultView toolCalls={toolCalls} />);
    expect(html).toContain('file_read');
    expect(html).toContain('file_write');
    // React SSR inserts <!-- --> between expressions
    expect(html).toContain('Tool Calls (');
    expect(html).toContain('2');
  });

  it('should render running status', () => {
    const toolCalls: ToolCallDisplay[] = [
      {
        id: 'tc-1',
        name: 'shell_exec',
        arguments: '{}',
        status: 'running',
      },
    ];
    const html = renderToString(<ToolResultView toolCalls={toolCalls} />);
    expect(html).toContain('Running');
  });

  it('should render error status', () => {
    const toolCalls: ToolCallDisplay[] = [
      {
        id: 'tc-1',
        name: 'file_read',
        arguments: '{}',
        status: 'error',
        error: 'File not found',
      },
    ];
    const html = renderToString(<ToolResultView toolCalls={toolCalls} />);
    expect(html).toContain('Failed');
    expect(html).toContain('File not found');
  });

  it('should handle long results with collapse', () => {
    const longResult = Array.from({ length: 20 }, (_, i) => `Line ${i}`).join('\n');
    const toolCalls: ToolCallDisplay[] = [
      {
        id: 'tc-1',
        name: 'file_read',
        arguments: '{}',
        status: 'success',
        result: longResult,
      },
    ];
    const html = renderToString(<ToolResultView toolCalls={toolCalls} />);
    expect(html).toContain('lines');
  });
});
