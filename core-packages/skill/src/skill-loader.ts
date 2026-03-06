import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { ISkill } from '@core/types';
import { parseSkillMd } from './skill-parser.js';

/** File extension for skill markdown files */
const SKILL_FILE_EXTENSION = '.skill.md';

/**
 * Loads ISkill objects from .skill.md files on the filesystem.
 *
 * Reads files from a given directory (or individually) and parses
 * them into ISkill objects using the skill parser.
 */
export class SkillLoader {
  private readonly skillsDir: string;

  /**
   * @param skillsDir - Absolute path to the directory containing .skill.md files
   */
  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  /**
   * Reads all .skill.md files from the configured directory and
   * returns the parsed ISkill array.
   *
   * @throws if the directory does not exist or cannot be read
   */
  async loadAll(): Promise<ISkill[]> {
    const entries = await readdir(this.skillsDir);
    const skillFiles = entries.filter((entry) => entry.endsWith(SKILL_FILE_EXTENSION));

    const skills: ISkill[] = [];

    for (const fileName of skillFiles) {
      const filePath = join(this.skillsDir, fileName);
      const skill = await this.loadOne(filePath);
      skills.push(skill);
    }

    return skills;
  }

  /**
   * Reads and parses a single .skill.md file.
   *
   * @param filePath - Absolute path to the .skill.md file
   * @throws if the file does not exist, is not a .skill.md, or fails parsing
   */
  async loadOne(filePath: string): Promise<ISkill> {
    if (!filePath.endsWith(SKILL_FILE_EXTENSION)) {
      const ext = extname(filePath);
      throw new Error(
        `Expected a ${SKILL_FILE_EXTENSION} file, got "${ext || 'no extension'}": ${filePath}`
      );
    }

    const content = await readFile(filePath, 'utf-8');
    return parseSkillMd(content);
  }

  /**
   * Stub for future file-watching support.
   * Currently logs a message indicating that watching is not yet implemented.
   */
  watch(): void {
    console.log(`[SkillLoader] watch() called for "${this.skillsDir}" — not yet implemented`);
  }
}
