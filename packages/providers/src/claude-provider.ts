import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  LlmResponse,
  StreamEvent,
  ToolDescription,
  ToolCall,
  ProviderConfig,
} from '@cli-agent/core';
import { ProviderError } from '@cli-agent/core';
import { BaseProvider } from './base-provider.js';
import { extractToken } from './auth/auth-resolver.js';
import { extractThinkTag, estimateThinkingMs } from './thinking-parser.js';

interface AnthropicToolParam {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export class ClaudeProvider extends BaseProvider {
  readonly providerId = 'claude';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: ProviderConfig) {
    super('claude-provider');
    const apiKey = extractToken(config.auth);
    this.client = new Anthropic({ apiKey, baseURL: config.baseUrl });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
  }

  async chat(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): Promise<LlmResponse> {
    try {
      const systemMsg = messages.find((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemMsg?.content,
        messages: this.toAnthropicMessages(nonSystemMsgs),
        tools: tools ? this.toAnthropicTools(tools) : undefined,
      });

      return this.parseResponse(response);
    } catch (error) {
      throw new ProviderError(
        `Claude API error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async *stream(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): AsyncIterable<StreamEvent> {
    try {
      const systemMsg = messages.find((m) => m.role === 'system');
      const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemMsg?.content,
        messages: this.toAnthropicMessages(nonSystemMsgs),
        tools: tools ? this.toAnthropicTools(tools) : undefined,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string; partial_json?: string };
          if (delta.type === 'text_delta' && delta.text) {
            yield { type: 'text_delta', content: delta.text };
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            yield { type: 'tool_call_delta', content: delta.partial_json };
          }
        } else if (event.type === 'content_block_start') {
          const block = event.content_block as { type: string; id?: string; name?: string };
          if (block.type === 'tool_use') {
            yield {
              type: 'tool_call_start',
              toolCall: { id: block.id, name: block.name },
            };
          }
        } else if (event.type === 'message_stop') {
          const finalMessage = await stream.finalMessage();
          yield { type: 'done', response: this.parseResponse(finalMessage) };
        }
      }
    } catch (error) {
      throw new ProviderError(
        `Claude stream error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private toAnthropicMessages(
    messages: readonly Message[]
  ): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      if (msg.toolResults && msg.toolResults.length > 0) {
        return {
          role: 'user' as const,
          content: msg.toolResults.map((tr) => ({
            type: 'tool_result' as const,
            tool_use_id: tr.toolCallId,
            content: tr.content,
          })),
        };
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments),
          });
        }
        return { role: 'assistant' as const, content };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  private toAnthropicTools(tools: readonly ToolDescription[]): AnthropicToolParam[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: Object.fromEntries(
          tool.parameters.map((p) => [
            p.name,
            { type: p.type, description: p.description },
          ])
        ),
        required: tool.parameters
          .filter((p) => p.required)
          .map((p) => p.name),
      },
    }));
  }

  private parseResponse(response: Anthropic.Message): LlmResponse {
    let content = '';
    const toolCalls: ToolCall[] = [];
    let thinkingMs: number | undefined;

    for (const block of response.content) {
      if (block.type === 'thinking') {
        // Anthropic extended thinking block — estimate duration from token count
        // (no direct timing from API, but the block existing means thinking occurred)
        const thinkingBlock = block as { type: 'thinking'; thinking: string };
        thinkingMs = estimateThinkingMs(thinkingBlock.thinking);
      } else if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    // Fallback: parse <think>...</think> tags from text content (DeepSeek, etc.)
    const parsed = extractThinkTag(content);
    if (parsed.thinkContent) {
      content = parsed.cleanContent;
      if (!thinkingMs) {
        thinkingMs = estimateThinkingMs(parsed.thinkContent);
      }
    }

    const stopReason =
      response.stop_reason === 'tool_use'
        ? 'tool_use' as const
        : response.stop_reason === 'max_tokens'
          ? 'max_tokens' as const
          : 'end_turn' as const;

    return {
      content,
      stopReason,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        thinkingMs,
      },
    };
  }
}
