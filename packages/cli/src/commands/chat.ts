import type { AgentConfig } from '@cli-agent/core';
import { EventBus, Registry } from '@cli-agent/core';
import type { ITool } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import { AgentLoop } from '@cli-agent/agent';
import { CliRenderer } from '../renderer.js';
import { InputHandler } from '../input-handler.js';
import chalk from 'chalk';

export async function chatCommand(config: AgentConfig): Promise<void> {
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

  const input = new InputHandler();
  input.start();

  console.log(chalk.bold('\nCLI Agent'));
  console.log(chalk.dim('Type /help for commands, /exit to quit\n'));

  try {
    while (true) {
      const result = await input.prompt();

      if (result.type === 'exit') {
        renderer.renderInfo('Goodbye!');
        break;
      }

      if (result.type === 'help') {
        printHelp();
        continue;
      }

      if (result.type === 'clear') {
        console.clear();
        continue;
      }

      if (!result.content) {
        continue;
      }

      try {
        const response = await agent.run(result.content);
        renderer.renderAssistantMessage(response.content);
      } catch (error) {
        renderer.renderError(
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  } finally {
    renderer.detach();
    input.close();
  }
}

function printHelp(): void {
  console.log(chalk.bold('\nAvailable commands:'));
  console.log('  /help, /h     Show this help');
  console.log('  /clear        Clear the screen');
  console.log('  /exit, /quit  Exit the agent');
  console.log('');
}
