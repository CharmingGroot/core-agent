import { randomUUID } from 'node:crypto';
import type { AgentConfig } from './config.js';
import { EventBus } from './event-bus.js';
import type { JsonValue } from './types/common.js';

export class RunContext {
  readonly runId: string;
  readonly workingDirectory: string;
  readonly eventBus: EventBus;
  readonly config: AgentConfig;
  readonly createdAt: Date;
  private readonly metadata: Map<string, JsonValue>;
  private abortController: AbortController;

  constructor(config: AgentConfig, eventBus?: EventBus) {
    this.runId = randomUUID();
    this.workingDirectory = config.workingDirectory;
    this.config = config;
    this.eventBus = eventBus ?? new EventBus();
    this.createdAt = new Date();
    this.metadata = new Map();
    this.abortController = new AbortController();
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  abort(reason?: string): void {
    this.abortController.abort(reason);
  }

  setMetadata(key: string, value: JsonValue): void {
    this.metadata.set(key, value);
  }

  getMetadata(key: string): JsonValue | undefined {
    return this.metadata.get(key);
  }

  getAllMetadata(): ReadonlyMap<string, JsonValue> {
    return this.metadata;
  }
}
