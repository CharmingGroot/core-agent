/**
 * StatusSpinner — 터미널 한 줄을 실시간 갱신하는 상태 표시기.
 *
 * 표시 형태:
 *   ✽ Thinking… (3.2s · ↓ 1.2k tokens)
 *   ⚙ file_read… (1.5s)
 *   ✽ Responding… (5.1s · ↓ 2.4k ↑ 0.3k tokens)
 */
import chalk from 'chalk';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const REFRESH_MS = 100;

export interface SpinnerMetrics {
  inputTokens?: number;
  outputTokens?: number;
  streamChunks?: number;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}m ${sec}s`;
}

export class StatusSpinner {
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;
  private label = '';
  private icon = '✽';
  private metrics: SpinnerMetrics = {};
  private isTTY: boolean;

  constructor() {
    this.isTTY = process.stdout.isTTY ?? false;
  }

  /**
   * Start the spinner with a label.
   * Clears the line and begins updating in-place.
   */
  start(label: string, icon = '✽'): void {
    this.stop();
    this.label = label;
    this.icon = icon;
    this.startTime = Date.now();
    this.frameIndex = 0;
    this.metrics = {};

    if (this.isTTY) {
      this.render();
      this.timer = setInterval(() => this.render(), REFRESH_MS);
    } else {
      // Non-TTY: just print once
      process.stdout.write(`  ${icon} ${label}\n`);
    }
  }

  /** Update metrics while spinning */
  updateMetrics(metrics: Partial<SpinnerMetrics>): void {
    if (metrics.inputTokens !== undefined) this.metrics.inputTokens = metrics.inputTokens;
    if (metrics.outputTokens !== undefined) this.metrics.outputTokens = metrics.outputTokens;
    if (metrics.streamChunks !== undefined) this.metrics.streamChunks = metrics.streamChunks;
  }

  /** Stop the spinner and optionally print a final message */
  stop(finalMessage?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY) {
      this.clearLine();
      if (finalMessage) {
        process.stdout.write(`  ${finalMessage}\n`);
      }
    } else if (finalMessage) {
      process.stdout.write(`  ${finalMessage}\n`);
    }
  }

  /** Check if spinner is currently active */
  get isActive(): boolean {
    return this.timer !== null;
  }

  private render(): void {
    const elapsed = Date.now() - this.startTime;
    const frame = SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
    this.frameIndex++;

    const parts: string[] = [];
    parts.push(formatElapsed(elapsed));

    if (this.metrics.inputTokens) {
      parts.push(`↓ ${formatTokens(this.metrics.inputTokens)}`);
    }
    if (this.metrics.outputTokens) {
      parts.push(`↑ ${formatTokens(this.metrics.outputTokens)}`);
    }
    if (this.metrics.inputTokens || this.metrics.outputTokens) {
      parts.push('tokens');
    }
    if (this.metrics.streamChunks) {
      parts.push(`${this.metrics.streamChunks} chunks`);
    }

    const detail = chalk.dim(`(${parts.join(' · ')})`);
    const line = `  ${chalk.cyan(frame)} ${this.icon} ${chalk.bold(this.label)} ${detail}`;

    this.clearLine();
    process.stdout.write(line);
  }

  private clearLine(): void {
    process.stdout.write('\r\x1b[K');
  }
}
