import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { SoulLoader } from '../src/soul-loader.js';

const TEST_DIR = join(tmpdir(), 'cli-agent-test-soul');

describe('SoulLoader', () => {
  let loader: SoulLoader;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    loader = new SoulLoader(TEST_DIR);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should not be loaded when no SOUL.md exists', async () => {
    await loader.load();
    expect(loader.isLoaded).toBe(false);
  });

  it('should return empty string for system prompt when not loaded', async () => {
    await loader.load();
    expect(loader.toSystemPrompt()).toBe('');
  });

  it('should load existing SOUL.md', async () => {
    await writeFile(join(TEST_DIR, 'SOUL.md'), '# My Persona\nBe helpful.', 'utf-8');
    await loader.load();
    expect(loader.isLoaded).toBe(true);
    expect(loader.getContent()).toContain('My Persona');
  });

  it('should wrap content in soul tags for system prompt', async () => {
    await writeFile(join(TEST_DIR, 'SOUL.md'), '# Persona\nBe concise.', 'utf-8');
    await loader.load();
    const prompt = loader.toSystemPrompt();
    expect(prompt).toContain('<soul>');
    expect(prompt).toContain('Be concise.');
    expect(prompt).toContain('</soul>');
  });

  it('should create default SOUL.md with init', async () => {
    const created = await loader.init();
    expect(created).toBe(true);
    expect(existsSync(join(TEST_DIR, 'SOUL.md'))).toBe(true);

    const content = await readFile(join(TEST_DIR, 'SOUL.md'), 'utf-8');
    expect(content).toContain('# Soul');
    expect(content).toContain('Persona');
  });

  it('should not overwrite existing SOUL.md on init', async () => {
    await writeFile(join(TEST_DIR, 'SOUL.md'), 'custom soul', 'utf-8');
    const created = await loader.init();
    expect(created).toBe(false);

    const content = await readFile(join(TEST_DIR, 'SOUL.md'), 'utf-8');
    expect(content).toBe('custom soul');
  });

  it('should be loaded after init', async () => {
    await loader.init();
    expect(loader.isLoaded).toBe(true);
  });

  it('should reload from disk', async () => {
    await writeFile(join(TEST_DIR, 'SOUL.md'), 'version 1', 'utf-8');
    await loader.load();
    expect(loader.getContent()).toBe('version 1');

    await writeFile(join(TEST_DIR, 'SOUL.md'), 'version 2', 'utf-8');
    await loader.reload();
    expect(loader.getContent()).toBe('version 2');
  });

  it('should expose file path', () => {
    expect(loader.filePath).toContain('SOUL.md');
  });

  it('should handle empty SOUL.md as not loaded', async () => {
    await writeFile(join(TEST_DIR, 'SOUL.md'), '', 'utf-8');
    await loader.load();
    expect(loader.isLoaded).toBe(false);
    expect(loader.toSystemPrompt()).toBe('');
  });
});
