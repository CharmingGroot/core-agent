import { describe, it, expect } from 'vitest';
import { HistoryCompressor } from '../src/history-compressor.js';
import type { ContextMessage } from '@core/types';

function makeMessage(
  role: ContextMessage['role'],
  content: string,
  extras?: Partial<ContextMessage>,
): ContextMessage {
  return { role, content, ...extras };
}

describe('HistoryCompressor', () => {
  const compressor = new HistoryCompressor();

  it('should return messages unchanged when within budget', () => {
    const messages: ContextMessage[] = [
      makeMessage('user', 'hello'),
      makeMessage('assistant', 'hi'),
    ];

    const result = compressor.compress(messages, 100000);

    expect(result.messages).toEqual(messages);
    expect(result.summarizedCount).toBe(0);
    expect(result.compressedTokens).toBe(result.originalTokens);
  });

  it('should compress when over budget', () => {
    const longContent = 'x'.repeat(400);
    const messages: ContextMessage[] = [
      makeMessage('tool_result', longContent, { toolName: 'first' }),
      makeMessage('assistant', longContent),
      makeMessage('tool_result', longContent, { toolName: 'middle1' }),
      makeMessage('assistant', longContent),
      makeMessage('tool_result', longContent, { toolName: 'middle2' }),
      makeMessage('assistant', longContent),
      makeMessage('tool_result', longContent, { toolName: 'last1' }),
      makeMessage('tool_result', longContent, { toolName: 'last2' }),
      makeMessage('tool_result', longContent, { toolName: 'last3' }),
      makeMessage('user', 'recent question 1'),
      makeMessage('user', 'recent question 2'),
    ];

    // Set a tight budget so compression is triggered
    const result = compressor.compress(messages, 50);

    expect(result.summarizedCount).toBeGreaterThan(0);
    expect(result.wasCompressed !== undefined || result.summarizedCount > 0).toBe(true);
  });

  it('should pin the first tool_result', () => {
    const messages: ContextMessage[] = [
      makeMessage('tool_result', 'first result', { toolName: 'init' }),
      makeMessage('assistant', 'a'.repeat(400)),
      makeMessage('tool_result', 'b'.repeat(400), { toolName: 'mid' }),
      makeMessage('assistant', 'c'.repeat(400)),
      makeMessage('user', 'last user msg'),
    ];

    const result = compressor.compress(messages, 10);
    const contents = result.messages.map((m) => m.content);

    // First tool_result should be preserved
    expect(contents.some((c) => c === 'first result')).toBe(true);
  });

  it('should pin last N tool results', () => {
    const messages: ContextMessage[] = [
      makeMessage('tool_result', 'result-1', { toolName: 't1' }),
      makeMessage('assistant', 'a'.repeat(400)),
      makeMessage('tool_result', 'result-2', { toolName: 't2' }),
      makeMessage('assistant', 'b'.repeat(400)),
      makeMessage('tool_result', 'result-3', { toolName: 't3' }),
      makeMessage('tool_result', 'result-4', { toolName: 't4' }),
      makeMessage('tool_result', 'result-5', { toolName: 't5' }),
      makeMessage('user', 'question'),
    ];

    const result = compressor.compress(messages, 10);
    const contents = result.messages.map((m) => m.content);

    // Last 3 tool results should be preserved
    expect(contents.some((c) => c === 'result-3')).toBe(true);
    expect(contents.some((c) => c === 'result-4')).toBe(true);
    expect(contents.some((c) => c === 'result-5')).toBe(true);
  });

  it('should pin error tool results', () => {
    const messages: ContextMessage[] = [
      makeMessage('tool_result', 'ok result', { toolName: 't1' }),
      makeMessage('assistant', 'a'.repeat(400)),
      makeMessage('tool_result', 'Error: file not found', { toolName: 't2' }),
      makeMessage('assistant', 'b'.repeat(400)),
      makeMessage('tool_result', 'ok again', { toolName: 't3' }),
      makeMessage('user', 'question'),
    ];

    const result = compressor.compress(messages, 10);
    const contents = result.messages.map((m) => m.content);

    expect(contents.some((c) => c === 'Error: file not found')).toBe(true);
  });

  it('should pin last N user messages', () => {
    const messages: ContextMessage[] = [
      makeMessage('user', 'old question'),
      makeMessage('assistant', 'a'.repeat(400)),
      makeMessage('user', 'recent question 1'),
      makeMessage('assistant', 'b'.repeat(400)),
      makeMessage('user', 'recent question 2'),
    ];

    const result = compressor.compress(messages, 10);
    const contents = result.messages.map((m) => m.content);

    expect(contents.some((c) => c === 'recent question 1')).toBe(true);
    expect(contents.some((c) => c === 'recent question 2')).toBe(true);
  });

  it('should produce a summary message for compressed content', () => {
    const messages: ContextMessage[] = [
      makeMessage('tool_result', 'first', { toolName: 'init' }),
      makeMessage('assistant', 'x'.repeat(400)),
      makeMessage('assistant', 'y'.repeat(400)),
      makeMessage('assistant', 'z'.repeat(400)),
      makeMessage('user', 'last msg'),
    ];

    const result = compressor.compress(messages, 10);
    const summaryMsg = result.messages.find((m) => m.role === 'summary');

    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content).toContain('Conversation Summary');
  });
});

describe('HistoryCompressor.extractKeyPoints', () => {
  const compressor = new HistoryCompressor();

  it('should extract key points from messages', () => {
    const messages: ContextMessage[] = [
      makeMessage('user', 'What is the status?'),
      makeMessage('assistant', 'Everything is running fine.'),
      makeMessage('tool_result', 'metrics: cpu=50%', { toolName: 'monitor' }),
    ];

    const summary = compressor.extractKeyPoints(messages);

    expect(summary).toContain('Conversation Summary');
    expect(summary).toContain('What is the status?');
    expect(summary).toContain('[monitor]');
    expect(summary).toContain('3 messages');
  });

  it('should truncate long content in summary', () => {
    const messages: ContextMessage[] = [
      makeMessage('assistant', 'x'.repeat(500)),
    ];

    const summary = compressor.extractKeyPoints(messages);

    expect(summary).toContain('...');
    // Should not contain the full 500 chars
    expect(summary.length).toBeLessThan(500);
  });
});
