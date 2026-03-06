import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const MEMORY_FILE = 'MEMORY.md';
const MEMORY_DIR = '.cli-agent';
const MAX_MEMORY_LINES = 200;

export class MemoryManager {
  private readonly memoryPath: string;
  private entries: string[] = [];

  constructor(workingDirectory: string) {
    this.memoryPath = join(workingDirectory, MEMORY_DIR, MEMORY_FILE);
  }

  get filePath(): string {
    return this.memoryPath;
  }

  async load(): Promise<void> {
    try {
      if (!existsSync(this.memoryPath)) {
        this.entries = [];
        return;
      }
      const content = await readFile(this.memoryPath, 'utf-8');
      this.entries = content
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim());
    } catch {
      this.entries = [];
    }
  }

  async save(): Promise<void> {
    const dir = dirname(this.memoryPath);
    await mkdir(dir, { recursive: true });

    const lines = [
      '# Memory',
      '',
      `> Auto-managed by CLI Agent. ${this.entries.length} entries.`,
      '',
      ...this.entries.map((e) => `- ${e}`),
      '',
    ];

    if (lines.length > MAX_MEMORY_LINES) {
      const trimmed = this.entries.slice(-150);
      this.entries = trimmed;
      return this.save();
    }

    await writeFile(this.memoryPath, lines.join('\n'), 'utf-8');
  }

  add(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.entries.includes(trimmed)) return;
    this.entries.push(trimmed);
  }

  remove(keyword: string): number {
    const lower = keyword.toLowerCase();
    const before = this.entries.length;
    this.entries = this.entries.filter(
      (e) => !e.toLowerCase().includes(lower)
    );
    return before - this.entries.length;
  }

  search(keyword: string): string[] {
    const lower = keyword.toLowerCase();
    return this.entries.filter((e) => e.toLowerCase().includes(lower));
  }

  list(): readonly string[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  toSystemPrompt(): string {
    if (this.entries.length === 0) return '';
    return [
      '\n\n<memory>',
      'The following are remembered facts from previous sessions:',
      ...this.entries.map((e) => `- ${e}`),
      '</memory>',
    ].join('\n');
  }
}
