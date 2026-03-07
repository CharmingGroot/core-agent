/**
 * Parsing utilities for extended thinking / <think> blocks.
 *
 * Supports:
 * - <think>...</think> tags (DeepSeek, Qwen, etc.)
 * - Anthropic extended thinking content blocks (handled in provider)
 *
 * The thinkingMs is estimated from content length since the API
 * does not provide wall-clock timing for the thinking phase.
 */

const THINK_TAG_REGEX = /^<think>([\s\S]*?)<\/think>\s*/;

/** Tokens per second estimate for thinking content */
const THINKING_TOKENS_PER_SEC = 80;
/** Characters per token estimate */
const CHARS_PER_TOKEN = 4;

export interface ThinkTagResult {
  /** The content inside <think> tags, or undefined if no tags found */
  readonly thinkContent: string | undefined;
  /** The remaining content after removing <think> tags */
  readonly cleanContent: string;
}

/**
 * Extract <think>...</think> block from the beginning of content.
 * Returns the thinking content and cleaned content separately.
 */
export function extractThinkTag(content: string): ThinkTagResult {
  const match = content.match(THINK_TAG_REGEX);
  if (!match) {
    return { thinkContent: undefined, cleanContent: content };
  }
  return {
    thinkContent: match[1].trim(),
    cleanContent: content.slice(match[0].length),
  };
}

/**
 * Estimate thinking duration in milliseconds from thinking content.
 * Uses a rough tokens-per-second heuristic since APIs don't report
 * wall-clock thinking time.
 */
export function estimateThinkingMs(thinkContent: string): number {
  const estimatedTokens = Math.ceil(thinkContent.length / CHARS_PER_TOKEN);
  const seconds = estimatedTokens / THINKING_TOKENS_PER_SEC;
  return Math.round(seconds * 1000);
}
