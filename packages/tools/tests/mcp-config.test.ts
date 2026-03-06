import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpConfigStore } from '../src/mcp/mcp-config.js';
import type { McpServerConfig } from '../src/mcp/mcp-types.js';

describe('McpConfigStore', () => {
  let tempDir: string;
  let configPath: string;
  let store: McpConfigStore;

  const githubConfig: McpServerConfig = {
    name: 'github',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_TOKEN: 'test-token' },
  };

  const dbConfig: McpServerConfig = {
    name: 'database',
    transport: 'sse',
    url: 'http://localhost:3001',
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mcp-config-test-'));
    configPath = join(tempDir, 'subdir', 'mcp.json');
    store = new McpConfigStore(configPath);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should load from non-existent file and return empty array', async () => {
    const configs = await store.load();
    expect(configs).toEqual([]);
    expect(store.getAll()).toHaveLength(0);
  });

  it('should save and create file and directory', async () => {
    await store.addServer(githubConfig);

    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.servers).toHaveLength(1);
    expect(parsed.servers[0].name).toBe('github');
  });

  it('should round-trip addServer and load', async () => {
    await store.addServer(githubConfig);
    await store.addServer(dbConfig);

    // Create a fresh store to verify persistence
    const freshStore = new McpConfigStore(configPath);
    const loaded = await freshStore.load();

    expect(loaded).toHaveLength(2);
    expect(loaded[0].name).toBe('github');
    expect(loaded[0].transport).toBe('stdio');
    expect(loaded[0].command).toBe('npx');
    expect(loaded[1].name).toBe('database');
    expect(loaded[1].transport).toBe('sse');
    expect(loaded[1].url).toBe('http://localhost:3001');
  });

  it('should update existing config when addServer is called with duplicate name', async () => {
    await store.addServer(githubConfig);

    const updatedConfig: McpServerConfig = {
      name: 'github',
      transport: 'stdio',
      command: 'node',
      args: ['server.js'],
    };
    await store.addServer(updatedConfig);

    expect(store.getAll()).toHaveLength(1);
    expect(store.get('github')?.command).toBe('node');
    expect(store.get('github')?.args).toEqual(['server.js']);
  });

  it('should remove a server config and return true', async () => {
    await store.addServer(githubConfig);
    await store.addServer(dbConfig);

    const removed = await store.removeServer('github');
    expect(removed).toBe(true);
    expect(store.getAll()).toHaveLength(1);
    expect(store.has('github')).toBe(false);
    expect(store.has('database')).toBe(true);

    // Verify persistence
    const freshStore = new McpConfigStore(configPath);
    const loaded = await freshStore.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('database');
  });

  it('should return false when removing non-existent server', async () => {
    await store.addServer(githubConfig);
    const removed = await store.removeServer('nonexistent');
    expect(removed).toBe(false);
    expect(store.getAll()).toHaveLength(1);
  });

  it('should return all configs via getAll', async () => {
    await store.addServer(githubConfig);
    await store.addServer(dbConfig);

    const all = store.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('github');
    expect(all[1].name).toBe('database');
  });

  it('should return a specific config via get', async () => {
    await store.addServer(githubConfig);
    await store.addServer(dbConfig);

    const config = store.get('github');
    expect(config).toBeDefined();
    expect(config?.name).toBe('github');
    expect(config?.transport).toBe('stdio');

    const missing = store.get('nonexistent');
    expect(missing).toBeUndefined();
  });

  it('should check existence via has', async () => {
    await store.addServer(githubConfig);

    expect(store.has('github')).toBe(true);
    expect(store.has('nonexistent')).toBe(false);
  });
});
