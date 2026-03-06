import chalk from 'chalk';
import type { EventBus, ToolResult, ToolCall, LlmResponse } from '@cli-agent/core';

const COLLAPSED_LINE_LIMIT = 5;
const BOX_WIDTH = 72;

function boxTop(title: string, color: (s: string) => string): string {
  const inner = ` ${title} `;
  const padding = Math.max(0, BOX_WIDTH - inner.length - 2);
  return color(`+${inner}${'─'.repeat(padding)}+`);
}

function boxBottom(color: (s: string) => string): string {
  return color(`+${'─'.repeat(BOX_WIDTH - 2)}+`);
}

function boxLine(text: string, color: (s: string) => string): string {
  const maxContent = BOX_WIDTH - 4;
  const truncated = text.length > maxContent
    ? text.slice(0, maxContent - 3) + '...'
    : text;
  const padding = Math.max(0, maxContent - truncated.length);
  return color('| ') + truncated + ' '.repeat(padding) + color(' |');
}

function summarizeOutput(output: string): string[] {
  const lines = output.split('\n');
  if (lines.length <= COLLAPSED_LINE_LIMIT) {
    return lines;
  }
  const shown = lines.slice(0, COLLAPSED_LINE_LIMIT);
  const remaining = lines.length - COLLAPSED_LINE_LIMIT;
  shown.push(chalk.dim(`  ... +${remaining} lines`));
  return shown;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export class CliRenderer {
  private readonly eventBus: EventBus;
  private unsubscribers: Array<() => void> = [];
  private toolStartTimes = new Map<string, number>();
  private iterationCount = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  attach(): void {
    this.unsubscribers.push(
      this.eventBus.on('agent:start', ({ runId }) => {
        this.iterationCount = 0;
        this.totalInputTokens = 0;
        this.totalOutputTokens = 0;
        console.log(chalk.dim(`\n${'─'.repeat(BOX_WIDTH)}`));
        console.log(chalk.dim(`  Run: ${runId.slice(0, 8)}...`));
        console.log(chalk.dim(`${'─'.repeat(BOX_WIDTH)}`));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('agent:end', ({ reason }) => {
        console.log(chalk.dim(`\n${'─'.repeat(BOX_WIDTH)}`));
        const status = reason === 'complete'
          ? chalk.green('completed')
          : chalk.yellow(reason);
        const tokens = chalk.dim(
          `tokens: ${this.totalInputTokens} in / ${this.totalOutputTokens} out`
        );
        console.log(
          chalk.dim(`  ${status} | ${this.iterationCount} iteration(s) | ${tokens}`)
        );
        console.log(chalk.dim(`${'─'.repeat(BOX_WIDTH)}\n`));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('agent:error', ({ error }) => {
        console.log('');
        console.log(boxTop('ERROR', chalk.red));
        console.log(boxLine(error.message, chalk.red));
        if (error.stack) {
          const stackLines = error.stack.split('\n').slice(1, 4);
          for (const line of stackLines) {
            console.log(boxLine(chalk.dim(line.trim()), chalk.red));
          }
        }
        console.log(boxBottom(chalk.red));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('llm:request', () => {
        this.iterationCount++;
        console.log(
          chalk.dim(`\n  [${this.iterationCount}] `) + chalk.blue('Thinking...')
        );
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('llm:response', ({ response }) => {
        this.totalInputTokens += response.usage.inputTokens;
        this.totalOutputTokens += response.usage.outputTokens;

        const tokenInfo = chalk.dim(
          `(${response.usage.inputTokens}+${response.usage.outputTokens} tokens)`
        );

        if (response.toolCalls.length > 0) {
          console.log(
            chalk.dim(`  [${this.iterationCount}] `) +
            chalk.yellow(`${response.toolCalls.length} tool call(s) `) +
            tokenInfo
          );
        } else {
          console.log(
            chalk.dim(`  [${this.iterationCount}] `) +
            chalk.green('Response ready ') +
            tokenInfo
          );
        }
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('llm:stream', ({ chunk }) => {
        process.stdout.write(chunk);
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('tool:start', ({ toolCall }) => {
        this.toolStartTimes.set(toolCall.id, Date.now());
        console.log('');
        console.log(boxTop(toolCall.name, chalk.yellow));
        this.renderToolArgs(toolCall);
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('tool:end', ({ toolCall, result }) => {
        const startTime = this.toolStartTimes.get(toolCall.id);
        const duration = startTime ? Date.now() - startTime : 0;
        this.toolStartTimes.delete(toolCall.id);

        this.renderToolResult(result, duration);
        console.log(boxBottom(result.success ? chalk.green : chalk.red));
      })
    );

    this.unsubscribers.push(
      this.eventBus.on('tool:permission', ({ toolName }) => {
        console.log(
          chalk.cyan('  ? ') + `Allow ${chalk.bold(toolName)}? ` + chalk.dim('(y/n)')
        );
      })
    );
  }

  detach(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.toolStartTimes.clear();
  }

  renderAssistantMessage(content: string): void {
    if (!content) return;
    console.log('');
    console.log(chalk.white(content));
    console.log('');
  }

  renderError(message: string): void {
    console.log('');
    console.log(boxTop('ERROR', chalk.red));
    console.log(boxLine(message, chalk.red));
    console.log(boxBottom(chalk.red));
    console.log('');
  }

  renderInfo(message: string): void {
    console.log(chalk.blue(`  i ${message}`));
  }

  renderWarning(message: string): void {
    console.log(chalk.yellow(`  ! ${message}`));
  }

  private renderToolArgs(toolCall: ToolCall): void {
    try {
      const params = JSON.parse(toolCall.arguments);
      for (const [key, value] of Object.entries(params)) {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value);
        const lines = strValue.split('\n');

        if (lines.length <= COLLAPSED_LINE_LIMIT) {
          console.log(boxLine(
            chalk.dim(`${key}: `) + strValue,
            chalk.yellow
          ));
        } else {
          console.log(boxLine(
            chalk.dim(`${key}: `) + lines[0],
            chalk.yellow
          ));
          for (const line of lines.slice(1, COLLAPSED_LINE_LIMIT)) {
            console.log(boxLine(`  ${line}`, chalk.yellow));
          }
          const remaining = lines.length - COLLAPSED_LINE_LIMIT;
          console.log(boxLine(
            chalk.dim(`  ... +${remaining} lines`),
            chalk.yellow
          ));
        }
      }
    } catch {
      console.log(boxLine(
        chalk.dim('args: ') + toolCall.arguments.slice(0, 60),
        chalk.yellow
      ));
    }
  }

  private renderToolResult(result: ToolResult, durationMs: number): void {
    const duration = durationMs > 0 ? chalk.dim(` (${formatDuration(durationMs)})`) : '';

    if (result.success) {
      console.log(boxLine(
        chalk.green('success') + duration,
        chalk.green
      ));
      const lines = summarizeOutput(result.output);
      for (const line of lines) {
        console.log(boxLine(`  ${line}`, chalk.green));
      }
    } else {
      console.log(boxLine(
        chalk.red('failed') + duration,
        chalk.red
      ));
      if (result.error) {
        console.log(boxLine(chalk.red(`  ${result.error}`), chalk.red));
      }
      if (result.output) {
        const lines = summarizeOutput(result.output);
        for (const line of lines) {
          console.log(boxLine(`  ${line}`, chalk.red));
        }
      }
    }

    if (result.metadata) {
      const meta = Object.entries(result.metadata)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      if (meta) {
        console.log(boxLine(chalk.dim(`meta: ${meta}`), chalk.dim));
      }
    }
  }
}
