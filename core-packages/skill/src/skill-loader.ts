import { readdir, readFile, access } from 'node:fs/promises';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { join, extname } from 'node:path';
import type { ISkill, ISkillRegistry } from '@core/types';
import { parseSkillMd } from './skill-parser.js';

/** File extension for skill markdown files */
const SKILL_FILE_EXTENSION = '.skill.md';

/** Default debounce interval in milliseconds for file-watch events */
const WATCH_DEBOUNCE_MS = 100;

/** Cleanup function returned by watch() to stop the file watcher */
export type WatchStopFn = () => void;

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
   * Watches the skillsDir for .skill.md file changes and keeps the
   * given registry in sync.
   *
   * - File added / modified: (re-)parses the file and registers the skill.
   *   If the skill already exists in the registry it is unregistered first.
   * - File deleted: unregisters the skill whose name was mapped to that file.
   *
   * Returns a stop function that closes the underlying fs watcher and
   * clears all internal tracking state.
   *
   * @param registry - The skill registry to keep synchronised
   * @param debounceMs - Debounce interval in ms (default 100)
   */
  watch(registry: ISkillRegistry, debounceMs: number = WATCH_DEBOUNCE_MS): WatchStopFn {
    /**
     * Maps a filename (e.g. "deploy.skill.md") to the skill name that was
     * last registered from that file. Needed so we can unregister on delete
     * even though the file content is gone.
     */
    const fileToSkillName = new Map<string, string>();

    /** Pending debounce timers keyed by filename */
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    let watcher: FSWatcher | undefined;

    const handleFileEvent = (fileName: string): void => {
      /* Clear any pending timer for the same file */
      const existing = timers.get(fileName);
      if (existing !== undefined) {
        clearTimeout(existing);
      }

      timers.set(
        fileName,
        setTimeout(() => {
          timers.delete(fileName);
          void this.processFileChange(fileName, registry, fileToSkillName);
        }, debounceMs),
      );
    };

    watcher = fsWatch(this.skillsDir, (_eventType, rawFileName) => {
      /* On some platforms rawFileName may be null */
      if (rawFileName === null) {
        return;
      }

      const fileName = String(rawFileName);

      if (!fileName.endsWith(SKILL_FILE_EXTENSION)) {
        return;
      }

      handleFileEvent(fileName);
    });

    /* Return cleanup function */
    return () => {
      if (watcher) {
        watcher.close();
        watcher = undefined;
      }

      /* Cancel outstanding debounce timers */
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      fileToSkillName.clear();
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Processes a single file-change event:
   * - If the file still exists, (re-)loads and registers the skill.
   * - If the file was deleted, unregisters the previously-known skill.
   */
  private async processFileChange(
    fileName: string,
    registry: ISkillRegistry,
    fileToSkillName: Map<string, string>,
  ): Promise<void> {
    const filePath = join(this.skillsDir, fileName);

    const exists = await this.fileExists(filePath);

    if (exists) {
      try {
        const skill = await this.loadOne(filePath);

        /* Unregister previous version if present (name may have changed) */
        const previousName = fileToSkillName.get(fileName);
        if (previousName !== undefined) {
          registry.unregister(previousName);
        }
        /* Also unregister if the new name already exists (idempotent update) */
        if (registry.has(skill.name)) {
          registry.unregister(skill.name);
        }

        registry.register(skill);
        fileToSkillName.set(fileName, skill.name);
      } catch {
        /* Parse / IO errors are swallowed so the watcher keeps running */
      }
    } else {
      /* File was deleted */
      const previousName = fileToSkillName.get(fileName);
      if (previousName !== undefined) {
        registry.unregister(previousName);
        fileToSkillName.delete(fileName);
      }
    }
  }

  /**
   * Returns true if the given path is accessible on disk.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
