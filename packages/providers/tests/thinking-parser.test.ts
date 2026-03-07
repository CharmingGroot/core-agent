import { describe, it, expect } from 'vitest';
import { extractThinkTag, estimateThinkingMs } from '../src/thinking-parser.js';

describe('extractThinkTag', () => {
  it('should extract think tag from beginning of content', () => {
    const content = '<think>Let me analyze this step by step...</think>\nThe answer is 42.';
    const result = extractThinkTag(content);
    expect(result.thinkContent).toBe('Let me analyze this step by step...');
    expect(result.cleanContent).toBe('The answer is 42.');
  });

  it('should handle multiline think content', () => {
    const content = '<think>\nStep 1: Read the file\nStep 2: Parse the data\nStep 3: Return result\n</think>\nHere is the result.';
    const result = extractThinkTag(content);
    expect(result.thinkContent).toContain('Step 1');
    expect(result.thinkContent).toContain('Step 3');
    expect(result.cleanContent).toBe('Here is the result.');
  });

  it('should return undefined thinkContent when no think tags', () => {
    const content = 'Just a normal response without thinking.';
    const result = extractThinkTag(content);
    expect(result.thinkContent).toBeUndefined();
    expect(result.cleanContent).toBe(content);
  });

  it('should handle empty think tags', () => {
    const content = '<think></think>Response here.';
    const result = extractThinkTag(content);
    expect(result.thinkContent).toBe('');
    expect(result.cleanContent).toBe('Response here.');
  });

  it('should only match think tags at the beginning', () => {
    const content = 'Some text <think>should not match</think> more text.';
    const result = extractThinkTag(content);
    expect(result.thinkContent).toBeUndefined();
    expect(result.cleanContent).toBe(content);
  });

  it('should handle whitespace after closing tag', () => {
    const content = '<think>thinking...</think>   \nActual response.';
    const result = extractThinkTag(content);
    expect(result.thinkContent).toBe('thinking...');
    expect(result.cleanContent).toBe('Actual response.');
  });
});

describe('estimateThinkingMs', () => {
  it('should estimate thinking time from content length', () => {
    // 320 chars ≈ 80 tokens ≈ 1 second = 1000ms
    const content = 'a'.repeat(320);
    const ms = estimateThinkingMs(content);
    expect(ms).toBe(1000);
  });

  it('should return small value for short thinking', () => {
    const ms = estimateThinkingMs('brief thought');
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(500);
  });

  it('should return larger value for long thinking', () => {
    const longThought = 'a'.repeat(3200); // ~800 tokens ≈ 10s
    const ms = estimateThinkingMs(longThought);
    expect(ms).toBe(10000);
  });

  it('should handle empty string', () => {
    const ms = estimateThinkingMs('');
    expect(ms).toBe(0);
  });
});
