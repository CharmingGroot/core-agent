import type { Message, ToolCall, ToolResult } from '@cli-agent/core';

const CHARS_PER_TOKEN = 4;
const MESSAGE_OVERHEAD = 4;

function estimateTokens(msg: Message): number {
  let chars = msg.content.length;
  if (msg.toolCalls) {
    for (const tc of msg.toolCalls) {
      chars += tc.name.length + tc.arguments.length;
    }
  }
  if (msg.toolResults) {
    for (const tr of msg.toolResults) {
      chars += tr.content.length;
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}

export class MessageManager {
  private readonly messages: Message[] = [];
  private readonly maxHistoryTokens: number;

  constructor(maxHistoryTokens = 100000) {
    this.maxHistoryTokens = maxHistoryTokens;
  }

  addSystemMessage(content: string): void {
    this.messages.push({ role: 'system', content });
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

    this.messages.push({
      role: 'user',
      content: '',
      toolResults,
    });
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

  clear(): void {
    this.messages.length = 0;
  }

  /**
   * Compress history if it exceeds the token budget.
   * Keeps: system messages, last 2 user messages, last 3 assistant+tool pairs.
   * Summarizes older messages into a single system-level summary.
   * Returns the number of messages compressed (0 if no compression needed).
   */
  compressIfNeeded(): number {
    const totalTokens = this.messages.reduce((sum, m) => sum + estimateTokens(m), 0);
    if (totalTokens <= this.maxHistoryTokens) return 0;

    const system: Message[] = [];
    const rest: Message[] = [];

    for (const msg of this.messages) {
      if (msg.role === 'system') {
        system.push(msg);
      } else {
        rest.push(msg);
      }
    }

    // Keep last 6 messages (roughly 3 user/assistant pairs)
    const keepCount = Math.min(6, rest.length);
    const toSummarize = rest.slice(0, rest.length - keepCount);
    const toKeep = rest.slice(rest.length - keepCount);

    if (toSummarize.length === 0) return 0;

    const summaryParts: string[] = [];
    for (const msg of toSummarize) {
      const prefix = msg.role === 'user' ? 'User' : 'Assistant';
      const truncated = msg.content.length > 150
        ? msg.content.slice(0, 150) + '...'
        : msg.content;
      if (truncated) {
        summaryParts.push(`${prefix}: ${truncated}`);
      }
      if (msg.toolCalls) {
        const names = msg.toolCalls.map(tc => tc.name).join(', ');
        summaryParts.push(`  [tools: ${names}]`);
      }
    }

    const summaryMessage: Message = {
      role: 'user',
      content: `[Conversation summary - ${toSummarize.length} messages compressed]\n${summaryParts.join('\n')}`,
    };

    this.messages.length = 0;
    this.messages.push(...system, summaryMessage, ...toKeep);
    return toSummarize.length;
  }
}
