import type { Message, ToolCall, ToolResult } from '@cli-agent/core';
import { countHistoryTokens } from './token-counter.js';

export interface CompressionConfig {
  /** Maximum tokens in history before compression triggers (default: 100_000) */
  maxHistoryTokens?: number;
  /** Number of recent non-system messages to keep intact (default: 10) */
  keepRecentMessages?: number;
  /** Truncate individual message content to this length in summary (default: 300) */
  summaryContentLength?: number;
}

export class MessageManager {
  private readonly messages: Message[] = [];
  private readonly maxHistoryTokens: number;
  private readonly keepRecentMessages: number;
  private readonly summaryContentLength: number;

  constructor(config: CompressionConfig = {}) {
    this.maxHistoryTokens     = config.maxHistoryTokens     ?? 100_000;
    this.keepRecentMessages   = config.keepRecentMessages   ?? 10;
    this.summaryContentLength = config.summaryContentLength ?? 300;
  }

  addSystemMessage(content: string): void {
    this.messages.push({ role: 'system', content });
  }

  setSystemMessage(content: string): void {
    const idx = this.messages.findIndex(m => m.role === 'system');
    if (idx >= 0) {
      this.messages[idx] = { role: 'system', content };
    } else {
      this.messages.unshift({ role: 'system', content });
    }
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  addAssistantMessage(content: string, toolCalls?: readonly ToolCall[]): void {
    this.messages.push({
      role: 'assistant',
      content,
      toolCalls: toolCalls ? [...toolCalls] : undefined,
    });
  }

  addToolResults(results: ReadonlyMap<string, ToolResult>): void {
    const toolResults = [...results.entries()].map(([toolCallId, result]) => ({
      toolCallId,
      content: result.success
        ? result.output
        : `Error: ${result.error ?? 'Unknown error'}`,
    }));
    this.messages.push({ role: 'user', content: '', toolResults });
  }

  getMessages(): readonly Message[] {
    return [...this.messages];
  }

  getLastMessage(): Message | undefined {
    return this.messages[this.messages.length - 1];
  }

  get messageCount(): number {
    return this.messages.length;
  }

  /** Exact token count using js-tiktoken. */
  get totalTokens(): number {
    return countHistoryTokens(this.messages);
  }

  clear(): void {
    this.messages.length = 0;
  }

  serialize(): string {
    return JSON.stringify(this.messages);
  }

  restore(json: string): void {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid serialized messages: expected an array');
    }
    this.messages.length = 0;
    for (const item of parsed) {
      if (
        typeof item === 'object' && item !== null &&
        'role' in item && 'content' in item &&
        typeof (item as Message).role === 'string' &&
        typeof (item as Message).content === 'string'
      ) {
        this.messages.push(item as Message);
      }
    }
  }

  /**
   * Compress history if it exceeds the token budget.
   *
   * Strategy:
   * 1. Always keep all system messages.
   * 2. Keep the last `keepRecentMessages` non-system messages intact.
   * 3. Summarize older messages into a structured digest that preserves:
   *    - what the user asked
   *    - what tools were called and whether they succeeded
   *    - key assistant conclusions
   *
   * Returns the number of messages compressed (0 = no compression needed).
   */
  compressIfNeeded(): number {
    if (this.totalTokens <= this.maxHistoryTokens) return 0;

    const system: Message[] = [];
    const rest: Message[]   = [];

    for (const msg of this.messages) {
      if (msg.role === 'system') system.push(msg);
      else rest.push(msg);
    }

    const keepCount   = Math.min(this.keepRecentMessages, rest.length);
    const toSummarize = rest.slice(0, rest.length - keepCount);
    const toKeep      = rest.slice(rest.length - keepCount);

    if (toSummarize.length === 0) return 0;

    const summaryMessage: Message = {
      role: 'user',
      content: this.buildDigest(toSummarize),
    };

    this.messages.length = 0;
    this.messages.push(...system, summaryMessage, ...toKeep);
    return toSummarize.length;
  }

  private buildDigest(messages: Message[]): string {
    const maxLen = this.summaryContentLength;
    const lines: string[] = [
      `[Context summary — ${messages.length} earlier messages compressed]`,
      '',
    ];

    for (const msg of messages) {
      if (msg.role === 'user' && !msg.toolResults) {
        const text = truncate(msg.content, maxLen);
        if (text) lines.push(`User: ${text}`);
      }

      if (msg.role === 'assistant') {
        if (msg.content) {
          lines.push(`Assistant: ${truncate(msg.content, maxLen)}`);
        }
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            lines.push(`  → ${tc.name}(${truncate(tc.arguments, 120)})`);
          }
        }
      }

      if (msg.toolResults?.length) {
        for (const tr of msg.toolResults) {
          lines.push(`  ← result: ${truncate(tr.content, 120)}`);
        }
      }
    }

    lines.push('', '[End of summary — conversation continues below]');
    return lines.join('\n');
  }
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '…';
}

export { countMessageTokens, countHistoryTokens } from './token-counter.js';
