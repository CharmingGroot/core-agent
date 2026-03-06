import type {
  ILlmProvider,
  Message,
  LlmResponse,
  StreamEvent,
  ToolDescription,
} from '@cli-agent/core';
import { createChildLogger } from '@cli-agent/core';
import type { AgentLogger } from '@cli-agent/core';

export abstract class BaseProvider implements ILlmProvider {
  abstract readonly providerId: string;
  protected readonly logger: AgentLogger;

  constructor(loggerName: string) {
    this.logger = createChildLogger(loggerName);
  }

  abstract chat(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): Promise<LlmResponse>;

  abstract stream(
    messages: readonly Message[],
    tools?: readonly ToolDescription[]
  ): AsyncIterable<StreamEvent>;
}
