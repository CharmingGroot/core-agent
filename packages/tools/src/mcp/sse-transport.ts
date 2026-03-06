import { createChildLogger } from '@cli-agent/core';
import type { IMcpTransport } from './mcp-transport.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
} from './mcp-types.js';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * SSE transport — connects to an MCP server over HTTP.
 * Server → Client: SSE (EventSource pattern via fetch)
 * Client → Server: POST requests
 */
export class SseTransport implements IMcpTransport {
  private abortController: AbortController | null = null;
  private readonly pending = new Map<
    number | string,
    { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private notificationHandler: ((n: JsonRpcNotification) => void) | null = null;
  private isConnected = false;
  private messageEndpoint: string | null = null;
  private readonly logger = createChildLogger('mcp-sse');

  private readonly url: string;
  private readonly headers: Record<string, string>;

  constructor(url: string, headers?: Record<string, string>) {
    this.url = url;
    this.headers = headers ?? {};
  }

  get connected(): boolean {
    return this.isConnected;
  }

  async start(): Promise<void> {
    if (this.isConnected) return;

    this.abortController = new AbortController();

    const sseUrl = this.url.endsWith('/sse') ? this.url : `${this.url}/sse`;

    const response = await fetch(sseUrl, {
      headers: { ...this.headers, Accept: 'text/event-stream' },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('SSE response has no body');
    }

    this.isConnected = true;
    this.readSseStream(response.body).catch((err) => {
      if (this.isConnected) {
        this.logger.error({ error: String(err) }, 'SSE stream error');
        this.isConnected = false;
        this.rejectAllPending(err instanceof Error ? err : new Error(String(err)));
      }
    });

    // Wait for the endpoint event (server sends message endpoint URL)
    await this.waitForEndpoint();
  }

  async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.messageEndpoint) {
      throw new Error('SSE transport not ready — no message endpoint');
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`MCP request timed out: ${request.method} (id=${request.id})`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(request.id, { resolve, reject, timer });

      fetch(this.messageEndpoint!, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  async notify(notification: JsonRpcNotification): Promise<void> {
    if (!this.messageEndpoint) {
      throw new Error('SSE transport not ready — no message endpoint');
    }

    const response = await fetch(this.messageEndpoint, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      throw new Error(`Notification POST failed: ${response.status}`);
    }
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): void {
    this.notificationHandler = handler;
  }

  async close(): Promise<void> {
    this.isConnected = false;
    this.rejectAllPending(new Error('Transport closed'));
    this.abortController?.abort();
    this.abortController = null;
    this.messageEndpoint = null;
  }

  private async readSseStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          this.handleSseEvent(event);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private handleSseEvent(raw: string): void {
    let eventType = 'message';
    let data = '';

    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (eventType === 'endpoint') {
      this.resolveEndpoint(data);
      return;
    }

    if (!data) return;

    try {
      const msg = JSON.parse(data) as Record<string, unknown>;
      if ('id' in msg && msg['id'] !== undefined && msg['id'] !== null) {
        this.handleResponse(msg as unknown as JsonRpcResponse);
      } else if ('method' in msg) {
        this.notificationHandler?.(msg as unknown as JsonRpcNotification);
      }
    } catch {
      this.logger.warn({ data }, 'Failed to parse SSE message');
    }
  }

  private endpointResolve: ((url: string) => void) | null = null;

  private resolveEndpoint(url: string): void {
    // Resolve relative URLs against the base
    if (url.startsWith('/')) {
      const base = new URL(this.url);
      this.messageEndpoint = `${base.origin}${url}`;
    } else {
      this.messageEndpoint = url;
    }
    this.logger.info({ endpoint: this.messageEndpoint }, 'MCP message endpoint received');
    this.endpointResolve?.(this.messageEndpoint);
  }

  private waitForEndpoint(): Promise<string> {
    if (this.messageEndpoint) {
      return Promise.resolve(this.messageEndpoint);
    }
    return new Promise<string>((resolve, reject) => {
      this.endpointResolve = resolve;
      setTimeout(() => {
        if (!this.messageEndpoint) {
          reject(new Error('Timeout waiting for SSE endpoint event'));
        }
      }, REQUEST_TIMEOUT_MS);
    });
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
