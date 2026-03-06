import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import chalk from 'chalk';

const PROMPT_SYMBOL = '> ';

export type InputType =
  | 'message'
  | 'exit'
  | 'help'
  | 'clear'
  | 'model'
  | 'provider'
  | 'config'
  | 'temperature'
  | 'tokens'
  | 'system'
  | 'memory'
  | 'remember'
  | 'forget'
  | 'compact';

export interface InputResult {
  readonly type: InputType;
  readonly content: string;
}

const COMMAND_MAP: Record<string, InputType> = {
  '/exit': 'exit',
  '/quit': 'exit',
  '/q': 'exit',
  '/help': 'help',
  '/h': 'help',
  '/clear': 'clear',
  '/model': 'model',
  '/provider': 'provider',
  '/config': 'config',
  '/temperature': 'temperature',
  '/temp': 'temperature',
  '/tokens': 'tokens',
  '/maxtokens': 'tokens',
  '/system': 'system',
  '/memory': 'memory',
  '/mem': 'memory',
  '/remember': 'remember',
  '/forget': 'forget',
  '/compact': 'compact',
};

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

        if (!trimmed) {
          resolve({ type: 'message', content: '' });
          return;
        }

        if (trimmed.startsWith('/')) {
          const spaceIdx = trimmed.indexOf(' ');
          const cmd = spaceIdx === -1
            ? trimmed.toLowerCase()
            : trimmed.slice(0, spaceIdx).toLowerCase();
          const arg = spaceIdx === -1
            ? ''
            : trimmed.slice(spaceIdx + 1).trim();

          const type = COMMAND_MAP[cmd];
          if (type) {
            resolve({ type, content: arg });
            return;
          }
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
