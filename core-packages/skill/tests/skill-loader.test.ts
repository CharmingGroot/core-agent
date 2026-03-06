import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SkillLoader } from '../src/skill-loader.js';
import { SkillRegistry } from '../src/skill-registry.js';
import type { WatchStopFn } from '../src/skill-loader.js';

const SAMPLE_SKILL_MD = `# test-skill

## Description
A test skill.

## Tools
- tool_a
- tool_b

## Prompt
You are a test assistant.
`;

const ANOTHER_SKILL_MD = `# another-skill

## Tools
- tool_c

## Prompt
Another prompt.
`;

describe('SkillLoader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'skill-loader-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should load all .skill.md files from a directory', async () => {
    await writeFile(join(tempDir, 'test.skill.md'), SAMPLE_SKILL_MD);
    await writeFile(join(tempDir, 'another.skill.md'), ANOTHER_SKILL_MD);

    const loader = new SkillLoader(tempDir);
    const skills = await loader.loadAll();

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['another-skill', 'test-skill']);
  });

  it('should return empty array for a directory with no .skill.md files', async () => {
    await writeFile(join(tempDir, 'readme.md'), '# Not a skill');
    await writeFile(join(tempDir, 'notes.txt'), 'Just notes');

    const loader = new SkillLoader(tempDir);
    const skills = await loader.loadAll();

    expect(skills).toEqual([]);
  });

  it('should load a single .skill.md file', async () => {
    const filePath = join(tempDir, 'single.skill.md');
    await writeFile(filePath, SAMPLE_SKILL_MD);

    const loader = new SkillLoader(tempDir);
    const skill = await loader.loadOne(filePath);

    expect(skill.name).toBe('test-skill');
    expect(skill.tools).toEqual(['tool_a', 'tool_b']);
  });

  it('should throw when loading a non .skill.md file', async () => {
    const filePath = join(tempDir, 'notes.txt');
    await writeFile(filePath, 'not a skill');

    const loader = new SkillLoader(tempDir);

    await expect(loader.loadOne(filePath)).rejects.toThrow('Expected a .skill.md file');
  });

  it('should throw when the directory does not exist', async () => {
    const nonExistent = join(tempDir, 'does-not-exist');
    const loader = new SkillLoader(nonExistent);

    await expect(loader.loadAll()).rejects.toThrow();
  });

  it('should ignore non-.skill.md files when loading all', async () => {
    await writeFile(join(tempDir, 'valid.skill.md'), SAMPLE_SKILL_MD);
    await writeFile(join(tempDir, 'readme.md'), '# Readme');
    await writeFile(join(tempDir, 'config.json'), '{}');

    const loader = new SkillLoader(tempDir);
    const skills = await loader.loadAll();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('test-skill');
  });

  it('should call watch without throwing', () => {
    const loader = new SkillLoader(tempDir);
    const registry = new SkillRegistry();
    const stop = loader.watch(registry);
    expect(typeof stop).toBe('function');
    stop();
  });
});

/**
 * Helper: wait for a given number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce + fs.watch propagation can be slow on CI / Windows.
 * We use a short debounce and generous settle time.
 */
const DEBOUNCE_MS = 50;
const SETTLE_MS = 400;

describe('SkillLoader.watch()', () => {
  let tempDir: string;
  let stopFn: WatchStopFn | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'skill-watch-test-'));
  });

  afterEach(async () => {
    if (stopFn) {
      stopFn();
      stopFn = undefined;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should register a skill when a .skill.md file is created', async () => {
    const loader = new SkillLoader(tempDir);
    const registry = new SkillRegistry();
    stopFn = loader.watch(registry, DEBOUNCE_MS);

    await writeFile(join(tempDir, 'new.skill.md'), SAMPLE_SKILL_MD);
    await delay(SETTLE_MS);

    expect(registry.has('test-skill')).toBe(true);
    const skill = registry.get('test-skill');
    expect(skill?.tools).toEqual(['tool_a', 'tool_b']);
  });

  it('should re-register a skill when a .skill.md file is modified', async () => {
    /* Pre-create the file before watching */
    const filePath = join(tempDir, 'update.skill.md');
    await writeFile(filePath, SAMPLE_SKILL_MD);

    const loader = new SkillLoader(tempDir);
    const registry = new SkillRegistry();
    stopFn = loader.watch(registry, DEBOUNCE_MS);

    /* Modify the file with new content */
    await writeFile(filePath, ANOTHER_SKILL_MD);
    await delay(SETTLE_MS);

    /* The old name should be gone, new name should be present */
    expect(registry.has('another-skill')).toBe(true);
  });

  it('should unregister a skill when a .skill.md file is deleted', async () => {
    const filePath = join(tempDir, 'delete-me.skill.md');
    await writeFile(filePath, SAMPLE_SKILL_MD);

    const loader = new SkillLoader(tempDir);
    const registry = new SkillRegistry();

    /* Manually seed the registry so the watcher knows the mapping */
    const skill = await loader.loadOne(filePath);
    registry.register(skill);

    stopFn = loader.watch(registry, DEBOUNCE_MS);

    /* Trigger an add event so the watcher learns the file→name mapping */
    await writeFile(filePath, SAMPLE_SKILL_MD);
    await delay(SETTLE_MS);
    expect(registry.has('test-skill')).toBe(true);

    /* Now delete */
    await unlink(filePath);
    await delay(SETTLE_MS);

    expect(registry.has('test-skill')).toBe(false);
  });

  it('should stop watching when the stop function is called', async () => {
    const loader = new SkillLoader(tempDir);
    const registry = new SkillRegistry();
    stopFn = loader.watch(registry, DEBOUNCE_MS);

    /* Stop immediately */
    stopFn();
    stopFn = undefined;

    /* Create a file after stopping — should NOT be registered */
    await writeFile(join(tempDir, 'late.skill.md'), SAMPLE_SKILL_MD);
    await delay(SETTLE_MS);

    expect(registry.has('test-skill')).toBe(false);
  });

  it('should ignore non-.skill.md files', async () => {
    const loader = new SkillLoader(tempDir);
    const registry = new SkillRegistry();
    stopFn = loader.watch(registry, DEBOUNCE_MS);

    await writeFile(join(tempDir, 'readme.md'), '# Not a skill');
    await writeFile(join(tempDir, 'config.json'), '{}');
    await delay(SETTLE_MS);

    expect(registry.getAll()).toHaveLength(0);
  });
});
