import type { ISkill, ISkillRegistry } from '@core/types';

/**
 * Error thrown when attempting to register a skill whose name
 * (case-insensitive) already exists in the registry.
 */
export class DuplicateSkillError extends Error {
  constructor(name: string) {
    super(`Skill "${name}" is already registered`);
    this.name = 'DuplicateSkillError';
  }
}

/**
 * In-memory skill registry.
 *
 * Provides CRUD operations for ISkill objects.
 * All name lookups are case-insensitive.
 */
export class SkillRegistry implements ISkillRegistry {
  /** Internal storage keyed by lowercase skill name */
  private readonly skills: Map<string, ISkill> = new Map();

  /**
   * Registers a skill.
   *
   * @throws {DuplicateSkillError} if a skill with the same name already exists
   */
  register(skill: ISkill): void {
    const key = skill.name.toLowerCase();

    if (this.skills.has(key)) {
      throw new DuplicateSkillError(skill.name);
    }

    this.skills.set(key, skill);
  }

  /**
   * Retrieves a skill by name (case-insensitive).
   * Returns undefined if not found.
   */
  get(name: string): ISkill | undefined {
    return this.skills.get(name.toLowerCase());
  }

  /**
   * Checks whether a skill with the given name exists (case-insensitive).
   */
  has(name: string): boolean {
    return this.skills.has(name.toLowerCase());
  }

  /**
   * Returns all registered skills as a readonly array.
   */
  getAll(): readonly ISkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Removes a skill by name (case-insensitive).
   * Returns true if the skill was found and removed, false otherwise.
   */
  unregister(name: string): boolean {
    return this.skills.delete(name.toLowerCase());
  }
}
