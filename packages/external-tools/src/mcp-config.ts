import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { createChildLogger } from '@cli-agent/core';
import type { McpServerConfig } from './mcp-types.js';

const CONFIG_DIR = join(homedir(), '.chamelion');
const CONFIG_FILE = join(CONFIG_DIR, 'mcp.json');

/**
 * Persists MCP server configs to ~/.chamelion/mcp.json.
 * Supports runtime add/remove without restart.
 */
export class McpConfigStore {
  private configs: McpServerConfig[] = [];
  private readonly configPath: string;
  private readonly logger = createChildLogger('mcp-config');

  constructor(configPath?: string) {
    this.configPath = configPath ?? CONFIG_FILE;
  }

  /** Load configs from disk */
  async load(): Promise<McpServerConfig[]> {
    try {
      const data = await readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed.servers)) {
        this.logger.warn({ path: this.configPath }, 'MCP config missing "servers" array, using empty list');
        this.configs = [];
        return [];
      }
      this.configs = parsed.servers.filter((s: unknown) => {
        if (typeof s !== 'object' || s === null) return false;
        const entry = s as Record<string, unknown>;
        return typeof entry['name'] === 'string' && typeof entry['transport'] === 'string';
      });
      if (this.configs.length !== parsed.servers.length) {
        this.logger.warn(
          { total: parsed.servers.length, valid: this.configs.length },
          'Some MCP server configs were invalid and skipped',
        );
      }
      this.logger.info({ count: this.configs.length }, 'Loaded MCP configs');
      return this.configs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.configs = [];
        return [];
      }
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to load MCP config');
      throw error;
    }
  }

  /** Save current configs to disk */
  async save(): Promise<void> {
    const dir = dirname(this.configPath);
    await mkdir(dir, { recursive: true });
    const data = JSON.stringify({ servers: this.configs }, null, 2);
    await writeFile(this.configPath, data, 'utf-8');
    this.logger.info({ path: this.configPath }, 'Saved MCP configs');
  }

  /** Add a server config and save */
  async addServer(config: McpServerConfig): Promise<void> {
    const existing = this.configs.findIndex((c) => c.name === config.name);
    if (existing !== -1) {
      this.configs[existing] = config;
    } else {
      this.configs.push(config);
    }
    await this.save();
  }

  /** Remove a server config by name and save */
  async removeServer(name: string): Promise<boolean> {
    const before = this.configs.length;
    this.configs = this.configs.filter((c) => c.name !== name);
    if (this.configs.length < before) {
      await this.save();
      return true;
    }
    return false;
  }

  /** Get all saved configs */
  getAll(): readonly McpServerConfig[] {
    return this.configs;
  }

  /** Get a specific config by name */
  get(name: string): McpServerConfig | undefined {
    return this.configs.find((c) => c.name === name);
  }

  /** Check if a server config exists */
  has(name: string): boolean {
    return this.configs.some((c) => c.name === name);
  }
}
