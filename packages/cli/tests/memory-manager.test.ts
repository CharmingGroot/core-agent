import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryManager } from '../src/memory-manager.js';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-memory');

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    manager = new MemoryManager(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load empty when no file exists', async () => {
    await manager.load();
    expect(manager.list()).toHaveLength(0);
  });

  it('should add and list entries', () => {
    manager.add('user prefers TypeScript');
    manager.add('project uses pnpm workspace');
    expect(manager.list()).toHaveLength(2);
    expect(manager.list()[0]).toBe('user prefers TypeScript');
  });

  it('should not add duplicate entries', () => {
    manager.add('use vitest for testing');
    manager.add('use vitest for testing');
    expect(manager.list()).toHaveLength(1);
  });

  it('should not add empty strings', () => {
    manager.add('');
    manager.add('  ');
    expect(manager.list()).toHaveLength(0);
  });

  it('should save and load entries', async () => {
    manager.add('fact one');
    manager.add('fact two');
    await manager.save();

    const loaded = new MemoryManager(TEST_DIR);
    await loaded.load();
    expect(loaded.list()).toHaveLength(2);
    expect(loaded.list()).toContain('fact one');
    expect(loaded.list()).toContain('fact two');
  });

  it('should save as markdown file', async () => {
    manager.add('test entry');
    await manager.save();

    const content = await readFile(manager.filePath, 'utf-8');
    expect(content).toContain('# Memory');
    expect(content).toContain('- test entry');
  });

  it('should remove entries by keyword', () => {
    manager.add('user likes TypeScript');
    manager.add('project uses pnpm');
    manager.add('TypeScript strict mode enabled');
    const removed = manager.remove('typescript');
    expect(removed).toBe(2);
    expect(manager.list()).toHaveLength(1);
    expect(manager.list()[0]).toBe('project uses pnpm');
  });

  it('should return 0 when no entries match for remove', () => {
    manager.add('hello');
    const removed = manager.remove('nonexistent');
    expect(removed).toBe(0);
    expect(manager.list()).toHaveLength(1);
  });

  it('should search entries by keyword', () => {
    manager.add('user prefers dark theme');
    manager.add('project uses React');
    manager.add('use dark background in CLI');
    const results = manager.search('dark');
    expect(results).toHaveLength(2);
  });

  it('should clear all entries', () => {
    manager.add('entry 1');
    manager.add('entry 2');
    manager.clear();
    expect(manager.list()).toHaveLength(0);
  });

  it('should generate system prompt with entries', () => {
    manager.add('user is a senior developer');
    const prompt = manager.toSystemPrompt();
    expect(prompt).toContain('<memory>');
    expect(prompt).toContain('user is a senior developer');
    expect(prompt).toContain('</memory>');
  });

  it('should return empty string for system prompt when no entries', () => {
    expect(manager.toSystemPrompt()).toBe('');
  });

  it('should expose file path', () => {
    expect(manager.filePath).toContain('.cli-agent');
    expect(manager.filePath).toContain('MEMORY.md');
  });
});
