import chalk from 'chalk';
import type { EventBus } from '@cli-agent/core';

export class CliRenderer {
  private readonly eventBus: EventBus;
  private unsubscribers: Array<() => void> = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  attach(): void {
    this.unsubscribers.push(
      this.eventBus.on('agent:start', ({ runId }) => {
        console.log(chalk.dim(`[run:${runId.slice(0, 8)}] Agent started`));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('agent:end', ({ runId, reason }) => {
        console.log(chalk.dim(`[run:${runId.slice(0, 8)}] Agent ended (${reason})`));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('agent:error', ({ error }) => {
        console.error(chalk.red(`Error: ${error.message}`));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('llm:stream', ({ chunk }) => {
        process.stdout.write(chunk);
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('tool:start', ({ toolCall }) => {
        console.log(chalk.yellow(`\n> Tool: ${toolCall.name}`));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('tool:end', ({ toolCall, result }) => {
        if (result.success) {
          const preview = result.output.length > 200
            ? result.output.slice(0, 200) + '...'
            : result.output;
          console.log(chalk.green(`  Result: ${preview}`));
        } else {
          console.log(chalk.red(`  Error: ${result.error}`));
        }
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('tool:permission', ({ toolName }) => {
        console.log(chalk.cyan(`  Permission requested: ${toolName}`));
      })
    );
  }

  detach(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  renderAssistantMessage(content: string): void {
    if (content) {
      console.log(chalk.white('\n' + content + '\n'));
    }
  }

  renderError(message: string): void {
    console.error(chalk.red(`\nError: ${message}\n`));
  }

  renderInfo(message: string): void {
    console.log(chalk.blue(message));
  }

  renderWarning(message: string): void {
    console.log(chalk.yellow(message));
  }
}
