import type { SandboxConfig, ISandbox } from '@cli-agent/core';
import { SandboxError, createChildLogger } from '@cli-agent/core';
import { DockerSandbox } from './docker-wrapper.js';
import type { Logger } from 'pino';

const DEFAULT_POOL_SIZE = 2;

export class SandboxManager {
  private readonly pool: ISandbox[] = [];
  private readonly active = new Map<string, ISandbox>();
  private readonly logger: Logger;
  private config: SandboxConfig | undefined;

  constructor() {
    this.logger = createChildLogger('sandbox-manager');
  }

  async initialize(config: SandboxConfig, poolSize = DEFAULT_POOL_SIZE): Promise<void> {
    this.config = config;
    this.logger.info({ poolSize }, 'Initializing sandbox pool');

    const promises = Array.from({ length: poolSize }, () => this.createSandbox(config));
    const sandboxes = await Promise.all(promises);
    this.pool.push(...sandboxes);

    this.logger.info({ poolSize: this.pool.length }, 'Sandbox pool ready');
  }

  async acquire(): Promise<ISandbox> {
    let sandbox = this.pool.pop();
    if (!sandbox) {
      if (!this.config) {
        throw new SandboxError('SandboxManager not initialized');
      }
      this.logger.debug('Pool empty, creating new sandbox');
      sandbox = await this.createSandbox(this.config);
    }

    this.active.set(sandbox.containerId, sandbox);
    this.logger.debug({ containerId: sandbox.containerId }, 'Sandbox acquired');
    return sandbox;
  }

  async release(sandbox: ISandbox): Promise<void> {
    this.active.delete(sandbox.containerId);
    await sandbox.destroy();

    if (this.config && this.pool.length < DEFAULT_POOL_SIZE) {
      const replacement = await this.createSandbox(this.config);
      this.pool.push(replacement);
    }

    this.logger.debug({ containerId: sandbox.containerId }, 'Sandbox released');
  }

  async destroyAll(): Promise<void> {
    const allSandboxes = [...this.pool, ...this.active.values()];
    await Promise.allSettled(allSandboxes.map((s) => s.destroy()));
    this.pool.length = 0;
    this.active.clear();
    this.logger.info('All sandboxes destroyed');
  }

  get poolSize(): number {
    return this.pool.length;
  }

  get activeCount(): number {
    return this.active.size;
  }

  private async createSandbox(config: SandboxConfig): Promise<ISandbox> {
    const sandbox = new DockerSandbox();
    await sandbox.initialize(config);
    return sandbox;
  }
}
