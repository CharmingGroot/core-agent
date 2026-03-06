import type { AgentConfig } from '@cli-agent/core';
import { EventBus } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import { AgentLoop } from '@cli-agent/agent';
import { CliRenderer } from '../renderer.js';

export interface RunCommandOptions {
  readonly config: AgentConfig;
  readonly message: string;
}

export async function runCommand(options: RunCommandOptions): Promise<string> {
  const { config, message } = options;
  const provider = createProvider(config.provider);
  const toolRegistry = createToolRegistry();
  const eventBus = new EventBus();

  const agent = new AgentLoop({
    provider,
    toolRegistry,
    config,
    eventBus,
  });

  const renderer = new CliRenderer(eventBus);
  renderer.attach();

  try {
    const result = await agent.run(message);
    renderer.renderAssistantMessage(result.content);
    return result.content;
  } finally {
    renderer.detach();
  }
}
