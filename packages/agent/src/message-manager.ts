import type { Message, ToolCall, ToolResult } from '@cli-agent/core';

export class MessageManager {
  private readonly messages: Message[] = [];

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
}
