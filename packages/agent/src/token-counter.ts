import { getEncoding, type Tiktoken } from 'js-tiktoken';
import type { Message } from '@cli-agent/core';

// cl100k_base: Claude, GPT-4, GPT-3.5-turbo
// o200k_base:  GPT-4o, o1, o3
const MODEL_ENCODING: Record<string, string> = {
  'claude': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-3.5': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'o1': 'o200k_base',
  'o3': 'o200k_base',
};

const MESSAGE_OVERHEAD = 4;   // role + formatting tokens per message
const REPLY_OVERHEAD  = 3;   // assistant reply priming tokens

let enc: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!enc) {
    // cl100k_base works well enough for Claude and most OpenAI models.
    // For o200k_base models the count differs by ~3% — acceptable for budget tracking.
    enc = getEncoding('cl100k_base');
  }
  return enc;
}

export function resolveEncoding(modelId: string): string {
  const key = Object.keys(MODEL_ENCODING).find(k => modelId.toLowerCase().includes(k));
  return key ? MODEL_ENCODING[key] : 'cl100k_base';
}

/**
 * Count tokens in a plain text string.
 */
export function countTextTokens(text: string): number {
  if (!text) return 0;
  try {
    return getEncoder().encode(text).length;
  } catch {
    // Fallback: character estimate
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens for a single Message (content + tool calls + tool results).
 * Mirrors OpenAI's message token counting spec closely enough for Claude too.
 */
export function countMessageTokens(msg: Message): number {
  let tokens = MESSAGE_OVERHEAD;

  tokens += countTextTokens(msg.content);

  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      tokens += countTextTokens(tc.name);
      tokens += countTextTokens(tc.arguments);
      tokens += 3; // function_call framing
    }
  }

  if (msg.toolResults) {
    for (const tr of msg.toolResults) {
      tokens += countTextTokens(tr.content);
      tokens += 3; // tool result framing
    }
  }

  return tokens;
}

/**
 * Count total tokens across a message history.
 */
export function countHistoryTokens(messages: readonly Message[]): number {
  return messages.reduce((sum, m) => sum + countMessageTokens(m), REPLY_OVERHEAD);
}
