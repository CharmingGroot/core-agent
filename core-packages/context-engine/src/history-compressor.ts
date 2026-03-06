/**
 * History compression with pinning strategy.
 * Keeps important messages (first/last tool results, errors, recent user messages)
 * and summarizes middle messages into a single summary message.
 */

import type {
  ContextMessage,
  CompressedMessages,
  PinningStrategy,
} from '@core/types';
import { estimateMessageTokens } from './token-estimator.js';

/** Default pinning strategy matching the spec requirements */
const DEFAULT_STRATEGY: PinningStrategy = {
  pinned: [
    { type: 'first_tool_result', reason: 'Preserve initial context' },
    { type: 'last_n_tool_results', n: 3, reason: 'Keep recent results' },
    { type: 'error_results', reason: 'Preserve error context' },
    { type: 'user_messages_last_n', n: 2, reason: 'Keep recent user input' },
  ],
  summarizable: [
    { type: 'middle_tool_results', strategy: 'key_points_only' },
    { type: 'old_assistant_messages', strategy: 'key_points_only' },
  ],
};

/**
 * Compresses conversation history to fit within a token budget.
 * Uses a pinning strategy to preserve important messages and
 * summarizes the rest into a single summary message.
 */
export class HistoryCompressor {
  private readonly strategy: PinningStrategy;

  constructor(strategy?: PinningStrategy) {
    this.strategy = strategy ?? DEFAULT_STRATEGY;
  }

  /**
   * Compress messages to fit within maxTokens.
   * Pinned messages are always kept; middle messages are summarized.
   */
  compress(
    messages: readonly ContextMessage[],
    maxTokens: number,
  ): CompressedMessages {
    const originalTokens = messages.reduce(
      (sum, msg) => sum + estimateMessageTokens(msg),
      0,
    );

    // If already within budget, return as-is
    if (originalTokens <= maxTokens) {
      return {
        messages,
        originalTokens,
        compressedTokens: originalTokens,
        summarizedCount: 0,
      };
    }

    const pinnedIndices = this.findPinnedIndices(messages);
    const pinnedMessages: ContextMessage[] = [];
    const summarizableMessages: ContextMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      if (pinnedIndices.has(i)) {
        pinnedMessages.push(messages[i]);
      } else {
        summarizableMessages.push(messages[i]);
      }
    }

    // If nothing to summarize, return pinned only
    if (summarizableMessages.length === 0) {
      const compressedTokens = pinnedMessages.reduce(
        (sum, msg) => sum + estimateMessageTokens(msg),
        0,
      );
      return {
        messages: pinnedMessages,
        originalTokens,
        compressedTokens,
        summarizedCount: 0,
      };
    }

    const summaryText = this.extractKeyPoints(summarizableMessages);
    const summaryMessage: ContextMessage = {
      role: 'summary',
      content: summaryText,
    };

    // Build result: summary first, then pinned in original order
    const result: ContextMessage[] = [summaryMessage, ...pinnedMessages];
    const compressedTokens = result.reduce(
      (sum, msg) => sum + estimateMessageTokens(msg),
      0,
    );

    return {
      messages: result,
      originalTokens,
      compressedTokens,
      summarizedCount: summarizableMessages.length,
    };
  }

  /**
   * Extract key information from messages for summary.
   * Simple extraction without LLM calls — picks out the most
   * important content from each message.
   */
  extractKeyPoints(messages: readonly ContextMessage[]): string {
    const points: string[] = [];

    for (const msg of messages) {
      const prefix = this.rolePrefix(msg.role);
      // Truncate long content to first 200 chars for summary
      const truncated =
        msg.content.length > 200
          ? msg.content.slice(0, 200) + '...'
          : msg.content;

      if (msg.toolName) {
        points.push(`${prefix}[${msg.toolName}]: ${truncated}`);
      } else {
        points.push(`${prefix}: ${truncated}`);
      }
    }

    return `[Conversation Summary - ${messages.length} messages compressed]\n${points.join('\n')}`;
  }

  private rolePrefix(
    role: 'system' | 'user' | 'assistant' | 'tool_result' | 'summary',
  ): string {
    const prefixes: Record<string, string> = {
      system: 'System',
      user: 'User',
      assistant: 'Assistant',
      tool_result: 'Tool',
      summary: 'Summary',
    };
    return prefixes[role] ?? role;
  }

  /**
   * Determine which message indices should be pinned (kept as-is).
   */
  private findPinnedIndices(
    messages: readonly ContextMessage[],
  ): Set<number> {
    const pinned = new Set<number>();

    for (const rule of this.strategy.pinned) {
      switch (rule.type) {
        case 'first_tool_result':
          this.pinFirstToolResult(messages, pinned);
          break;
        case 'last_n_tool_results':
          this.pinLastNToolResults(messages, pinned, rule.n ?? 3);
          break;
        case 'error_results':
          this.pinErrorResults(messages, pinned);
          break;
        case 'user_messages_last_n':
          this.pinLastNUserMessages(messages, pinned, rule.n ?? 2);
          break;
      }
    }

    return pinned;
  }

  private pinFirstToolResult(
    messages: readonly ContextMessage[],
    pinned: Set<number>,
  ): void {
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'tool_result') {
        pinned.add(i);
        return;
      }
    }
  }

  private pinLastNToolResults(
    messages: readonly ContextMessage[],
    pinned: Set<number>,
    n: number,
  ): void {
    const toolIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'tool_result') {
        toolIndices.push(i);
      }
    }
    const lastN = toolIndices.slice(-n);
    for (const idx of lastN) {
      pinned.add(idx);
    }
  }

  private pinErrorResults(
    messages: readonly ContextMessage[],
    pinned: Set<number>,
  ): void {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (
        msg.role === 'tool_result' &&
        (msg.content.toLowerCase().includes('error') ||
          msg.content.toLowerCase().includes('failed') ||
          msg.content.toLowerCase().includes('exception'))
      ) {
        pinned.add(i);
      }
    }
  }

  private pinLastNUserMessages(
    messages: readonly ContextMessage[],
    pinned: Set<number>,
    n: number,
  ): void {
    const userIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        userIndices.push(i);
      }
    }
    const lastN = userIndices.slice(-n);
    for (const idx of lastN) {
      pinned.add(idx);
    }
  }
}
