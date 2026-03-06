import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import chalk from 'chalk';

const PROMPT_SYMBOL = '> ';
const EXIT_COMMANDS = new Set(['/exit', '/quit', '/q']);
const HELP_COMMANDS = new Set(['/help', '/h']);

export interface InputResult {
  readonly type: 'message' | 'exit' | 'help' | 'clear';
  readonly content: string;
}

export class InputHandler {
  private rl: ReadlineInterface | undefined;

  start(): void {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
  }

  async prompt(): Promise<InputResult> {
    return new Promise((resolve) => {
      if (!this.rl) {
        this.start();
      }
      this.rl!.question(chalk.cyan(PROMPT_SYMBOL), (answer) => {
        const trimmed = answer.trim();

        if (EXIT_COMMANDS.has(trimmed.toLowerCase())) {
          resolve({ type: 'exit', content: '' });
          return;
        }

        if (HELP_COMMANDS.has(trimmed.toLowerCase())) {
          resolve({ type: 'help', content: '' });
          return;
        }

        if (trimmed.toLowerCase() === '/clear') {
          resolve({ type: 'clear', content: '' });
          return;
        }

        resolve({ type: 'message', content: trimmed });
      });
    });
  }

  close(): void {
    this.rl?.close();
    this.rl = undefined;
  }
}
