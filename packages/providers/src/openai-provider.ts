import OpenAI from 'openai';
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

export class OpenAIProvider extends BaseProvider {
  readonly providerId = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: ProviderConfig) {
    super('openai-provider');
    const apiKey = extractToken(config.auth);
    this.client = new OpenAI({ apiKey, baseURL: config.baseUrl });
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
  }

  async chat(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): Promise<LlmResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: this.toOpenAIMessages(messages),
        tools: tools && tools.length > 0 ? this.toOpenAITools(tools) : undefined,
      });

      return this.parseResponse(response);
    } catch (error) {
      throw new ProviderError(
        `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async *stream(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): AsyncIterable<StreamEvent> {
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: this.toOpenAIMessages(messages),
        tools: tools && tools.length > 0 ? this.toOpenAITools(tools) : undefined,
        stream: true,
      });

      let content = '';
      const toolCalls: ToolCall[] = [];
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          yield { type: 'text_delta', content: delta.content };
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id) {
              toolCalls.push({
                id: tc.id,
                name: tc.function?.name ?? '',
                arguments: tc.function?.arguments ?? '',
              });
              yield {
                type: 'tool_call_start',
                toolCall: { id: tc.id, name: tc.function?.name },
              };
            } else if (tc.function?.arguments) {
              const last = toolCalls[toolCalls.length - 1];
              if (last) {
                toolCalls[toolCalls.length - 1] = {
                  ...last,
                  arguments: last.arguments + tc.function.arguments,
                };
              }
              yield { type: 'tool_call_delta', content: tc.function.arguments };
            }
          }
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }

        if (chunk.choices[0]?.finish_reason) {
          const stopReason =
            chunk.choices[0].finish_reason === 'tool_calls'
              ? 'tool_use' as const
              : chunk.choices[0].finish_reason === 'length'
                ? 'max_tokens' as const
                : 'end_turn' as const;

          yield {
            type: 'done',
            response: {
              content,
              stopReason,
              toolCalls,
              usage: { inputTokens, outputTokens },
            },
          };
        }
      }
    } catch (error) {
      throw new ProviderError(
        `OpenAI stream error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private toOpenAIMessages(
    messages: readonly Message[]
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: tr.content,
          });
        }
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
      } else if (msg.role === 'assistant') {
        result.push({ role: 'assistant', content: msg.content });
      } else {
        result.push({ role: 'user', content: msg.content });
      }
    }

    return result;
  }

  private toOpenAITools(
    tools: readonly ToolDescription[]
  ): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
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
      },
    }));
  }

  private parseResponse(
    response: OpenAI.ChatCompletion
  ): LlmResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new ProviderError('No choices in OpenAI response');
    }

    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    const stopReason =
      choice.finish_reason === 'tool_calls'
        ? 'tool_use' as const
        : choice.finish_reason === 'length'
          ? 'max_tokens' as const
          : 'end_turn' as const;

    return {
      content: choice.message.content ?? '',
      stopReason,
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
