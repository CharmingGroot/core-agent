/**
 * Token estimation utilities.
 * Uses chars/4 heuristic for approximate token counting.
 * Good enough for budget management without requiring a tokenizer.
 */

import type { ContextMessage, ToolDescriptionRef } from '@core/types';

/** Average characters per token (heuristic) */
const CHARS_PER_TOKEN = 4;

/** Overhead tokens for message framing (role, delimiters, etc.) */
const MESSAGE_OVERHEAD_TOKENS = 4;

/** Overhead tokens for tool description framing */
const TOOL_OVERHEAD_TOKENS = 8;

/**
 * Estimate token count for a plain text string.
 * Uses chars/4 heuristic which is a reasonable approximation
 * for English text and code across most tokenizers.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens required to describe a tool in the context window.
 * Includes the tool name, description, and all parameter descriptions.
 */
export function estimateToolTokens(tool: ToolDescriptionRef): number {
  const nameTokens = estimateTokens(tool.name);
  const descTokens = estimateTokens(tool.description);

  const paramTokens = tool.parameters.reduce((sum, param) => {
    return (
      sum +
      estimateTokens(param.name) +
      estimateTokens(param.type) +
      estimateTokens(param.description)
    );
  }, 0);

  return nameTokens + descTokens + paramTokens + TOOL_OVERHEAD_TOKENS;
}

/**
 * Estimate tokens for a context message.
 * If the message already has a tokenEstimate, use that.
 * Otherwise calculate from content + overhead.
 */
export function estimateMessageTokens(msg: ContextMessage): number {
  if (msg.tokenEstimate !== undefined) {
    return msg.tokenEstimate;
  }

  let tokens = estimateTokens(msg.content) + MESSAGE_OVERHEAD_TOKENS;

  if (msg.toolName) {
    tokens += estimateTokens(msg.toolName);
  }

  if (msg.toolCallId) {
    tokens += estimateTokens(msg.toolCallId);
  }

  return tokens;
}
