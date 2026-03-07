/**
 * @core/skill — Detailed scenario tests for parseSkillMd, SkillRegistry, and SkillLoader.
 *
 * All package imports use dynamic `await import(...)` to match the project convention.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ISkill } from '@core/types';

import type {
  SkillRegistry as SkillRegistryType,
  SkillLoader as SkillLoaderType,
} from '@core/skill';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

const FULL_SKILL_MD = `# code-review

## description
Review code for quality and bugs

## tools
- file_read
- content_search

## rules
- no-destructive-command
- pii-redact

## prompt
You are a code reviewer. Read the specified files and provide feedback on code quality, potential bugs, and improvements.

## parameters
- language: typescript
- maxFiles: 10
`;

const MINIMAL_SKILL_MD = `# minimal-skill

## prompt
Just a prompt, nothing else.
`;

const MULTI_TOOL_SKILL_MD = `# multi-tool

## tools
- file_read
- file_write
- shell_exec
- content_search
- web_fetch

## prompt
Use multiple tools.
`;

const MULTI_RULE_SKILL_MD = `# strict-skill

## tools
- file_read

## rules
- no-destructive-command
- pii-redact
- max-tool-calls
- rate-limiter
- session-isolation
`;

const HYPHENATED_NAME_SKILL_MD = `# my-skill-2

## tools
- file_read

## prompt
Skill with hyphens and numbers in name.
`;

const MULTI_PARAGRAPH_PROMPT_MD = `# essay-writer

## prompt
First paragraph of the prompt.

Second paragraph with more detail.

Third paragraph wrapping up.
`;

/* ------------------------------------------------------------------ */
/*  1. parseSkillMd — Valid Formats                                   */
/* ------------------------------------------------------------------ */

describe('Scenario 1: parseSkillMd — Valid Formats', () => {
  let parseSkillMd: (content: string) => ISkill;

  beforeEach(async () => {
    const mod = await import('@core/skill');
    parseSkillMd = mod.parseSkillMd;
  });

  it('full skill with all sections parses correctly', () => {
    const skill = parseSkillMd(FULL_SKILL_MD);

    expect(skill.name).toBe('code-review');
    expect(skill.description).toBe('Review code for quality and bugs');
    expect(skill.tools).toEqual(['file_read', 'content_search']);
    expect(skill.rules).toEqual(['no-destructive-command', 'pii-redact']);
    expect(skill.prompt).toContain('You are a code reviewer');
    expect(skill.parameters).toEqual({ language: 'typescript', maxFiles: '10' });
  });

  it('skill with only name and prompt works (tools/rules/parameters default empty)', () => {
    const skill = parseSkillMd(MINIMAL_SKILL_MD);

    expect(skill.name).toBe('minimal-skill');
    expect(skill.prompt).toBe('Just a prompt, nothing else.');
    expect(skill.tools).toEqual([]);
    expect(skill.rules).toEqual([]);
    expect(skill.parameters).toEqual({});
  });

  it('skill with multiple tools in bullet list populates tools array', () => {
    const skill = parseSkillMd(MULTI_TOOL_SKILL_MD);

    expect(skill.tools).toHaveLength(5);
    expect(skill.tools).toEqual([
      'file_read',
      'file_write',
      'shell_exec',
      'content_search',
      'web_fetch',
    ]);
  });

  it('skill with multiple rules populates rules array', () => {
    const skill = parseSkillMd(MULTI_RULE_SKILL_MD);

    expect(skill.rules).toHaveLength(5);
    expect(skill.rules).toContain('no-destructive-command');
    expect(skill.rules).toContain('pii-redact');
    expect(skill.rules).toContain('max-tool-calls');
    expect(skill.rules).toContain('rate-limiter');
    expect(skill.rules).toContain('session-isolation');
  });
});

/* ------------------------------------------------------------------ */
/*  2. parseSkillMd — Edge Cases                                      */
/* ------------------------------------------------------------------ */

describe('Scenario 2: parseSkillMd — Edge Cases', () => {
  let parseSkillMd: (content: string) => ISkill;
  let SkillParseError: new (message: string) => Error;

  beforeEach(async () => {
    const mod = await import('@core/skill');
    parseSkillMd = mod.parseSkillMd;
    SkillParseError = mod.SkillParseError;
  });

  it('skill name with hyphens and numbers: "my-skill-2"', () => {
    const skill = parseSkillMd(HYPHENATED_NAME_SKILL_MD);
    expect(skill.name).toBe('my-skill-2');
  });

  it('empty tools section results in tools = []', () => {
    const content = `# empty-tools

## tools

## prompt
Some prompt text.
`;
    const skill = parseSkillMd(content);
    expect(skill.tools).toEqual([]);
  });

  it('prompt with multiple paragraphs is preserved', () => {
    const skill = parseSkillMd(MULTI_PARAGRAPH_PROMPT_MD);

    expect(skill.prompt).toContain('First paragraph');
    expect(skill.prompt).toContain('Second paragraph');
    expect(skill.prompt).toContain('Third paragraph');
  });

  it('extra whitespace and newlines are handled gracefully', () => {
    const content = `#   padded-name

## tools
-   file_read
-  content_search

## prompt

  Some prompt with leading spaces.

`;
    const skill = parseSkillMd(content);
    expect(skill.name).toBe('padded-name');
    expect(skill.tools).toContain('file_read');
    expect(skill.tools).toContain('content_search');
    expect(skill.prompt).toBeTruthy();
  });

  it('empty content throws SkillParseError', () => {
    expect(() => parseSkillMd('')).toThrow(SkillParseError);
  });

  it('content with no H1 header throws SkillParseError', () => {
    const content = `## tools
- file_read

## prompt
Missing the H1 name.
`;
    expect(() => parseSkillMd(content)).toThrow(SkillParseError);
  });

  it('content with only H1 (no tools or prompt) throws SkillParseError', () => {
    const content = `# orphan-skill

## description
Has description but no tools or prompt.
`;
    expect(() => parseSkillMd(content)).toThrow(SkillParseError);
  });
});

/* ------------------------------------------------------------------ */
/*  3. SkillRegistry — CRUD                                           */
/* ------------------------------------------------------------------ */

describe('Scenario 3: SkillRegistry — CRUD', () => {
  let SkillRegistry: typeof SkillRegistryType;
  let DuplicateSkillError: new (name: string) => Error;

  beforeEach(async () => {
    const mod = await import('@core/skill');
    SkillRegistry = mod.SkillRegistry;
    DuplicateSkillError = mod.DuplicateSkillError;
  });

  function makeSkill(overrides: Partial<ISkill> = {}): ISkill {
    return {
      name: 'test-skill',
      description: 'A test skill',
      tools: ['file_read'],
      prompt: 'Do testing.',
      rules: [],
      parameters: {},
      ...overrides,
    };
  }

  it('register then get returns the skill', () => {
    const registry = new SkillRegistry();
    const skill = makeSkill({ name: 'alpha' });

    registry.register(skill);

    const retrieved = registry.get('alpha');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('alpha');
    expect(retrieved!.tools).toEqual(['file_read']);
  });

  it('has() returns true for registered, false for unregistered', () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill({ name: 'exists' }));

    expect(registry.has('exists')).toBe(true);
    expect(registry.has('does-not-exist')).toBe(false);
  });

  it('getAll() returns all registered skills', () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill({ name: 'skill-a' }));
    registry.register(makeSkill({ name: 'skill-b' }));
    registry.register(makeSkill({ name: 'skill-c' }));

    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((s) => s.name)).toEqual(
      expect.arrayContaining(['skill-a', 'skill-b', 'skill-c']),
    );
  });

  it('unregister removes skill, has() returns false after', () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill({ name: 'removable' }));

    expect(registry.has('removable')).toBe(true);

    const removed = registry.unregister('removable');
    expect(removed).toBe(true);
    expect(registry.has('removable')).toBe(false);
    expect(registry.get('removable')).toBeUndefined();
  });

  it('duplicate register throws DuplicateSkillError', () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill({ name: 'unique' }));

    expect(() => registry.register(makeSkill({ name: 'unique' }))).toThrow(
      DuplicateSkillError,
    );
  });

  it('get() is case-insensitive (register "Code-Review", get "code-review")', () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill({ name: 'Code-Review' }));

    const result = registry.get('code-review');
    expect(result).toBeDefined();
    expect(result!.name).toBe('Code-Review');

    const resultUpper = registry.get('CODE-REVIEW');
    expect(resultUpper).toBeDefined();
    expect(resultUpper!.name).toBe('Code-Review');
  });

  it('has() is case-insensitive', () => {
    const registry = new SkillRegistry();
    registry.register(makeSkill({ name: 'Mixed-Case' }));

    expect(registry.has('mixed-case')).toBe(true);
    expect(registry.has('MIXED-CASE')).toBe(true);
  });

  it('unregister on non-existent skill returns false', () => {
    const registry = new SkillRegistry();
    const removed = registry.unregister('ghost');
    expect(removed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  4. SkillLoader — File Loading                                     */
/* ------------------------------------------------------------------ */

describe('Scenario 4: SkillLoader — File Loading', () => {
  let SkillLoader: typeof SkillLoaderType;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import('@core/skill');
    SkillLoader = mod.SkillLoader;
    tmpDir = await mkdtemp(join(tmpdir(), 'skill-loader-test-'));
  });

  afterAll(async () => {
    // Clean up all temp directories created during tests.
    // Individual tmpDir refs are lost, but the OS temp folder handles cleanup.
  });

  it('loadAll() returns both skills from a directory with 2 .skill.md files', async () => {
    const skillA = `# loader-alpha

## tools
- file_read

## prompt
Alpha prompt.
`;
    const skillB = `# loader-beta

## tools
- shell_exec

## prompt
Beta prompt.
`;

    await writeFile(join(tmpDir, 'alpha.skill.md'), skillA, 'utf-8');
    await writeFile(join(tmpDir, 'beta.skill.md'), skillB, 'utf-8');

    const loader = new SkillLoader(tmpDir);
    const skills = await loader.loadAll();

    expect(skills).toHaveLength(2);

    const names = skills.map((s) => s.name);
    expect(names).toContain('loader-alpha');
    expect(names).toContain('loader-beta');
  });

  it('loadOne() loads a specific file', async () => {
    const content = `# single-skill

## prompt
Only one file.
`;
    const filePath = join(tmpDir, 'single.skill.md');
    await writeFile(filePath, content, 'utf-8');

    const loader = new SkillLoader(tmpDir);
    const skill = await loader.loadOne(filePath);

    expect(skill.name).toBe('single-skill');
    expect(skill.prompt).toContain('Only one file');
  });

  it('loadAll() on empty directory returns []', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'skill-loader-empty-'));
    const loader = new SkillLoader(emptyDir);
    const skills = await loader.loadAll();

    expect(skills).toEqual([]);

    await rm(emptyDir, { recursive: true, force: true });
  });

  it('loadOne() on non-existent file throws', async () => {
    const loader = new SkillLoader(tmpDir);
    const fakePath = join(tmpDir, 'does-not-exist.skill.md');

    await expect(loader.loadOne(fakePath)).rejects.toThrow();
  });

  it('loadOne() on non-.skill.md file throws', async () => {
    const loader = new SkillLoader(tmpDir);
    const txtPath = join(tmpDir, 'readme.txt');
    await writeFile(txtPath, 'not a skill', 'utf-8');

    await expect(loader.loadOne(txtPath)).rejects.toThrow(/Expected a .skill.md file/);
  });

  it('loadAll() ignores non-.skill.md files in the directory', async () => {
    const skillContent = `# only-skill

## prompt
The real skill.
`;
    await writeFile(join(tmpDir, 'real.skill.md'), skillContent, 'utf-8');
    await writeFile(join(tmpDir, 'notes.txt'), 'not a skill', 'utf-8');
    await writeFile(join(tmpDir, 'data.json'), '{}', 'utf-8');

    const loader = new SkillLoader(tmpDir);
    const skills = await loader.loadAll();

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('only-skill');
  });
});

/* ------------------------------------------------------------------ */
/*  5. Full Integration: Load -> Register -> Lookup                   */
/* ------------------------------------------------------------------ */

describe('Scenario 5: Full Integration — Load -> Register -> Lookup', () => {
  let SkillLoader: typeof SkillLoaderType;
  let SkillRegistry: typeof SkillRegistryType;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import('@core/skill');
    SkillLoader = mod.SkillLoader;
    SkillRegistry = mod.SkillRegistry;
    tmpDir = await mkdtemp(join(tmpdir(), 'skill-integration-'));
  });

  afterAll(async () => {
    // Temp dirs are cleaned up by the OS.
  });

  it('loads skill files, registers them, and verifies lookup', async () => {
    const codeReviewMd = `# code-review

## description
Automated code review

## tools
- file_read
- content_search
- shell_exec

## rules
- no-destructive-command

## prompt
Review the code for bugs and style issues.

## parameters
- language: typescript
- strict: true
`;

    const deployMd = `# deploy

## description
Deploy to production

## tools
- shell_exec
- file_read

## prompt
Deploy the application using the configured pipeline.

## parameters
- env: production
`;

    const debugMd = `# debug-session

## tools
- file_read
- shell_exec
- content_search

## prompt
Help debug the reported issue step by step.
`;

    await writeFile(join(tmpDir, 'code-review.skill.md'), codeReviewMd, 'utf-8');
    await writeFile(join(tmpDir, 'deploy.skill.md'), deployMd, 'utf-8');
    await writeFile(join(tmpDir, 'debug.skill.md'), debugMd, 'utf-8');

    // Load all skills from disk
    const loader = new SkillLoader(tmpDir);
    const skills = await loader.loadAll();
    expect(skills).toHaveLength(3);

    // Register each into the registry
    const registry = new SkillRegistry();
    for (const skill of skills) {
      registry.register(skill);
    }

    // Verify registry.has() for each skill name
    expect(registry.has('code-review')).toBe(true);
    expect(registry.has('deploy')).toBe(true);
    expect(registry.has('debug-session')).toBe(true);

    // Verify registry.getAll().length matches file count
    expect(registry.getAll()).toHaveLength(3);

    // Verify get() returns correct tool lists
    const codeReview = registry.get('code-review');
    expect(codeReview).toBeDefined();
    expect(codeReview!.tools).toEqual(['file_read', 'content_search', 'shell_exec']);
    expect(codeReview!.prompt).toContain('Review the code');
    expect(codeReview!.parameters).toEqual({ language: 'typescript', strict: 'true' });
    expect(codeReview!.rules).toEqual(['no-destructive-command']);

    const deploy = registry.get('deploy');
    expect(deploy).toBeDefined();
    expect(deploy!.tools).toEqual(['shell_exec', 'file_read']);
    expect(deploy!.description).toBe('Deploy to production');
    expect(deploy!.parameters).toEqual({ env: 'production' });

    const debug = registry.get('debug-session');
    expect(debug).toBeDefined();
    expect(debug!.tools).toContain('content_search');
    expect(debug!.prompt).toContain('debug the reported issue');
  });

  it('case-insensitive lookup works after loading from files', async () => {
    const content = `# My-Custom-Skill

## prompt
A custom skill with mixed case name.
`;
    await writeFile(join(tmpDir, 'custom.skill.md'), content, 'utf-8');

    const loader = new SkillLoader(tmpDir);
    const skills = await loader.loadAll();

    const registry = new SkillRegistry();
    for (const skill of skills) {
      registry.register(skill);
    }

    expect(registry.has('my-custom-skill')).toBe(true);
    expect(registry.has('MY-CUSTOM-SKILL')).toBe(true);

    const retrieved = registry.get('my-custom-skill');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('My-Custom-Skill');
  });

  it('loading duplicate skill names from different files causes DuplicateSkillError on register', async () => {
    const skillA = `# duplicate-name

## prompt
First version.
`;
    const skillB = `# duplicate-name

## prompt
Second version.
`;
    await writeFile(join(tmpDir, 'a.skill.md'), skillA, 'utf-8');
    await writeFile(join(tmpDir, 'b.skill.md'), skillB, 'utf-8');

    const loader = new SkillLoader(tmpDir);
    const skills = await loader.loadAll();
    expect(skills).toHaveLength(2);

    const { DuplicateSkillError } = await import('@core/skill');
    const registry = new SkillRegistry();
    registry.register(skills[0]);

    expect(() => registry.register(skills[1])).toThrow(DuplicateSkillError);
  });
});
