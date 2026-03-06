import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const SOUL_FILE = 'SOUL.md';

const DEFAULT_SOUL = `# Soul

## Persona
You are a helpful, knowledgeable software engineering assistant.

## Tone
- Clear and concise
- Professional but approachable
- Prefer practical examples over abstract explanations

## Rules
- Always explain your reasoning before taking action
- Ask for clarification when the request is ambiguous
- Respect the user's codebase conventions
`;

export class SoulLoader {
  private readonly soulPath: string;
  private content: string = '';

  constructor(workingDirectory: string) {
    this.soulPath = join(workingDirectory, SOUL_FILE);
  }

  get filePath(): string {
    return this.soulPath;
  }

  get isLoaded(): boolean {
    return this.content.length > 0;
  }

  async load(): Promise<void> {
    try {
      if (!existsSync(this.soulPath)) {
        this.content = '';
        return;
      }
      this.content = await readFile(this.soulPath, 'utf-8');
    } catch {
      this.content = '';
    }
  }

  async init(): Promise<boolean> {
    if (existsSync(this.soulPath)) {
      return false;
    }
    await writeFile(this.soulPath, DEFAULT_SOUL, 'utf-8');
    this.content = DEFAULT_SOUL;
    return true;
  }

  async reload(): Promise<void> {
    await this.load();
  }

  getContent(): string {
    return this.content;
  }

  toSystemPrompt(): string {
    if (!this.content) return '';
    return `<soul>\n${this.content.trim()}\n</soul>\n\n`;
  }
}
