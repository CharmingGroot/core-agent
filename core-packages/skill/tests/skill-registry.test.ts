import { describe, it, expect, beforeEach } from 'vitest';
import type { ISkill } from '@core/types';
import { SkillRegistry, DuplicateSkillError } from '../src/skill-registry.js';

function makeSkill(overrides: Partial<ISkill> = {}): ISkill {
  return {
    name: 'test-skill',
    description: 'A test skill',
    tools: ['tool_a'],
    prompt: 'You are a test assistant.',
    rules: ['rule_a'],
    parameters: { key: 'value' },
    ...overrides,
  };
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('should register and retrieve a skill', () => {
    const skill = makeSkill();
    registry.register(skill);

    const result = registry.get('test-skill');
    expect(result).toBeDefined();
    expect(result?.name).toBe('test-skill');
  });

  it('should return undefined for unregistered skill', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should throw DuplicateSkillError on duplicate registration', () => {
    registry.register(makeSkill());

    expect(() => registry.register(makeSkill())).toThrow(DuplicateSkillError);
    expect(() => registry.register(makeSkill())).toThrow('already registered');
  });

  it('should perform case-insensitive lookups', () => {
    registry.register(makeSkill({ name: 'Code-Review' }));

    expect(registry.has('code-review')).toBe(true);
    expect(registry.has('CODE-REVIEW')).toBe(true);
    expect(registry.has('Code-Review')).toBe(true);

    expect(registry.get('CODE-REVIEW')?.name).toBe('Code-Review');
  });

  it('should detect duplicates case-insensitively', () => {
    registry.register(makeSkill({ name: 'My-Skill' }));

    expect(() =>
      registry.register(makeSkill({ name: 'my-skill' }))
    ).toThrow(DuplicateSkillError);
  });

  it('should return all registered skills via getAll()', () => {
    registry.register(makeSkill({ name: 'skill-a' }));
    registry.register(makeSkill({ name: 'skill-b' }));
    registry.register(makeSkill({ name: 'skill-c' }));

    const all = registry.getAll();
    expect(all).toHaveLength(3);

    const names = all.map((s) => s.name).sort();
    expect(names).toEqual(['skill-a', 'skill-b', 'skill-c']);
  });

  it('should unregister a skill and return true', () => {
    registry.register(makeSkill({ name: 'removable' }));

    expect(registry.has('removable')).toBe(true);
    const removed = registry.unregister('removable');
    expect(removed).toBe(true);
    expect(registry.has('removable')).toBe(false);
  });

  it('should return false when unregistering a non-existent skill', () => {
    expect(registry.unregister('ghost')).toBe(false);
  });

  it('should unregister case-insensitively', () => {
    registry.register(makeSkill({ name: 'CamelSkill' }));

    const removed = registry.unregister('camelskill');
    expect(removed).toBe(true);
    expect(registry.has('CamelSkill')).toBe(false);
  });
});
