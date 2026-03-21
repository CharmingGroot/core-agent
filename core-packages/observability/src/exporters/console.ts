import type { Trace, Span } from '../types.js';
import type { ITraceExporter } from '../types.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function c(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function spanColor(kind: Span['kind']): keyof typeof COLORS {
  if (kind === 'agent') return 'cyan';
  if (kind === 'llm') return 'magenta';
  return 'yellow';
}

function bar(durationMs: number, maxMs: number, width = 20): string {
  const filled = Math.round((durationMs / maxMs) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export class ConsoleExporter implements ITraceExporter {
  export(trace: Trace): void {
    const maxDuration = trace.durationMs ?? 1;

    console.log('\n' + c('bold', '─'.repeat(60)));
    console.log(c('bold', `Trace: ${trace.traceId.slice(0, 8)}`));
    console.log(
      `  run: ${c('cyan', trace.runId.slice(0, 8))}  ` +
      `model: ${c('magenta', trace.model)}  ` +
      `status: ${trace.status === 'ok' ? c('green', 'ok') : c('red', trace.status)}  ` +
      `total: ${c('yellow', `${trace.durationMs}ms`)}`
    );
    console.log(
      `  tokens: ${c('blue', `↑${trace.totalInputTokens} ↓${trace.totalOutputTokens}`)}`
    );
    console.log(c('dim', '─'.repeat(60)));

    for (const span of trace.spans) {
      const indent = span.kind === 'agent' ? '' : '  ';
      const color = spanColor(span.kind);
      const statusMark = span.status === 'ok' ? c('green', '✓') : c('red', '✗');
      const b = c('dim', bar(span.durationMs, maxDuration));

      console.log(
        `${indent}${statusMark} ${c(color, span.name.padEnd(30))} ` +
        `${String(span.durationMs).padStart(6)}ms  ${b}`
      );

      if (span.kind === 'llm') {
        const attrs = span.attributes;
        console.log(
          c('dim', `${indent}   ↑${attrs['llm.inputTokens']} ↓${attrs['llm.outputTokens']} stop=${attrs['llm.stopReason']}`)
        );
      }
      if (span.error) {
        console.log(c('red', `${indent}   error: ${span.error}`));
      }
    }

    console.log(c('bold', '─'.repeat(60)) + '\n');
  }
}
