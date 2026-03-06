import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateToolTokens,
  estimateMessageTokens,
} from '../src/token-estimator.js';
import type { ContextMessage, ToolDescriptionRef } from '@core/types';

describe('estimateTokens', () => {
  it('should return 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should estimate tokens using chars/4 heuristic', () => {
    // 20 chars -> ceil(20/4) = 5 tokens
    expect(estimateTokens('12345678901234567890')).toBe(5);
  });

  it('should ceil the result for non-divisible lengths', () => {
    // 5 chars -> ceil(5/4) = 2 tokens
    expect(estimateTokens('hello')).toBe(2);
  });

  it('should handle single character', () => {
    // 1 char -> ceil(1/4) = 1 token
    expect(estimateTokens('a')).toBe(1);
  });

  it('should handle long text', () => {
    const longText = 'a'.repeat(1000);
    expect(estimateTokens(longText)).toBe(250);
  });
});

describe('estimateToolTokens', () => {
  it('should estimate tokens for a tool with parameters', () => {
    const tool: ToolDescriptionRef = {
      name: 'readFile',
      description: 'Read a file from disk',
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: 'The file path to read',
          required: true,
        },
      ],
      tokenEstimate: 0,
    };

    const result = estimateToolTokens(tool);
    // name(2) + desc(6) + param.name(1) + param.type(2) + param.desc(6) + overhead(8) = 25
    expect(result).toBeGreaterThan(0);
    expect(result).toBe(
      Math.ceil('readFile'.length / 4) +
        Math.ceil('Read a file from disk'.length / 4) +
        Math.ceil('path'.length / 4) +
        Math.ceil('string'.length / 4) +
        Math.ceil('The file path to read'.length / 4) +
        8,
    );
  });

  it('should include overhead for tool framing', () => {
    const minimalTool: ToolDescriptionRef = {
      name: 'x',
      description: 'y',
      parameters: [],
      tokenEstimate: 0,
    };

    const result = estimateToolTokens(minimalTool);
    // name(1) + desc(1) + overhead(8) = 10
    expect(result).toBe(10);
  });

  it('should handle multiple parameters', () => {
    const tool: ToolDescriptionRef = {
      name: 'search',
      description: 'Search files',
      parameters: [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'limit', type: 'number', description: 'Max results', required: false },
      ],
      tokenEstimate: 0,
    };

    const result = estimateToolTokens(tool);
    expect(result).toBeGreaterThan(estimateToolTokens({
      ...tool,
      parameters: [tool.parameters[0]],
    }));
  });
});

describe('estimateMessageTokens', () => {
  it('should use provided tokenEstimate when available', () => {
    const msg: ContextMessage = {
      role: 'user',
      content: 'Hello world',
      tokenEstimate: 42,
    };

    expect(estimateMessageTokens(msg)).toBe(42);
  });

  it('should estimate from content when no tokenEstimate', () => {
    const msg: ContextMessage = {
      role: 'user',
      content: '12345678901234567890', // 20 chars = 5 tokens
    };

    // 5 content tokens + 4 overhead = 9
    expect(estimateMessageTokens(msg)).toBe(9);
  });

  it('should include toolName in estimation', () => {
    const msgWithTool: ContextMessage = {
      role: 'tool_result',
      content: 'result data',
      toolName: 'readFile',
    };
    const msgWithoutTool: ContextMessage = {
      role: 'tool_result',
      content: 'result data',
    };

    expect(estimateMessageTokens(msgWithTool)).toBeGreaterThan(
      estimateMessageTokens(msgWithoutTool),
    );
  });

  it('should include toolCallId in estimation', () => {
    const msgWithId: ContextMessage = {
      role: 'tool_result',
      content: 'data',
      toolCallId: 'call_abc123',
    };
    const msgWithoutId: ContextMessage = {
      role: 'tool_result',
      content: 'data',
    };

    expect(estimateMessageTokens(msgWithId)).toBeGreaterThan(
      estimateMessageTokens(msgWithoutId),
    );
  });
});
