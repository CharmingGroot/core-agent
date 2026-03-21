import { appendFileSync } from 'fs';
import type { Trace } from '../types.js';
import type { ITraceExporter } from '../types.js';

/**
 * Appends each completed trace as a JSON line to a file.
 * Compatible with tools like jq, Grafana Loki, etc.
 */
export class FileExporter implements ITraceExporter {
  constructor(private readonly filePath: string) {}

  export(trace: Trace): void {
    const line = JSON.stringify(trace) + '\n';
    appendFileSync(this.filePath, line, 'utf8');
  }
}
