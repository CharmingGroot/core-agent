import { spawn, type ChildProcess } from 'node:child_process';
import { createChildLogger } from '@cli-agent/core';
import type { IMcpTransport } from './mcp-transport.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from './mcp-types.js';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Stdio transport — spawns a child process and communicates
 * via stdin (write) / stdout (read) using newline-delimited JSON.
 */
export class StdioTransport implements IMcpTransport {
  private process: ChildProcess | null = null;
  private readonly pending = new Map<
    number | string,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private notificationHandler: ((n: JsonRpcNotification) => void) | null = null;
  private buffer = '';
  private readonly logger = createChildLogger('mcp-stdio');

  private readonly command: string;
  private readonly args: readonly string[];
  private readonly env: Record<string, string> | undefined;

  constructor(command: string, args: readonly string[] = [], env?: Record<string, string>) {
    this.command = command;
    this.args = args;
    this.env = env;
  }

  get connected(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  async start(): Promise<void> {
    if (this.process) return;

    const mergedEnv = { ...process.env, ...this.env };

    this.process = spawn(this.command, [...this.args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: mergedEnv,
      windowsHide: true,
    });

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.handleData(chunk.toString('utf-8'));
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      this.logger.warn({ data: chunk.toString('utf-8') }, 'MCP server stderr');
    });

    this.process.on('exit', (code) => {
      this.logger.info({ code }, 'MCP server process exited');
      this.rejectAllPending(new Error(`MCP server exited with code ${code}`));
    });

    this.process.on('error', (err) => {
      this.logger.error({ error: err.message }, 'MCP server process error');
      this.rejectAllPending(err);
    });
  }

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.process?.stdin) {
      throw new Error('Stdio transport not started');
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`MCP request timed out: ${request.method} (id=${request.id})`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(request.id, { resolve, reject, timer });

      const data = JSON.stringify(request) + '\n';
      this.process!.stdin!.write(data, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(request.id);
          reject(err);
        }
      });
    });
  }

  async notify(notification: JsonRpcNotification): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Stdio transport not started');
    }
    const data = JSON.stringify(notification) + '\n';
    return new Promise<void>((resolve, reject) => {
      this.process!.stdin!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): void {
    this.notificationHandler = handler;
  }

  async close(): Promise<void> {
    this.rejectAllPending(new Error('Transport closed'));
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  private handleData(raw: string): void {
    this.buffer += raw;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as Record<string, unknown>;
        if ('id' in msg && msg['id'] !== undefined && msg['id'] !== null) {
          this.handleResponse(msg as unknown as JsonRpcResponse);
        } else if ('method' in msg) {
          this.notificationHandler?.(msg as unknown as JsonRpcNotification);
        }
      } catch {
        this.logger.warn({ line: trimmed }, 'Failed to parse MCP message');
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const entry = this.pending.get(response.id!);
    if (!entry) {
      this.logger.warn({ id: response.id }, 'Received response for unknown request');
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(response.id!);
    entry.resolve(response);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }
}
