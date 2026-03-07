import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import fastGlob from 'fast-glob';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { BaseTool } from './base-tool.js';

const MAX_RESULTS = 50;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const CONTEXT_LINES = 2;

export class ContentSearchTool extends BaseTool {
  readonly name = 'content_search';
  readonly requiresPermission = false;

  constructor() {
    super('content-search');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description:
        'Search file contents using a regex or literal pattern. ' +
        'Returns matching lines with context. Like grep/ripgrep.',
      parameters: [
        this.createParam('pattern', 'string', 'Regex or literal search pattern', true),
        this.createParam('glob', 'string', 'File glob to filter (default: **/*)', false),
        this.createParam('path', 'string', 'Directory to search in (default: working directory)', false),
        this.createParam('case_insensitive', 'boolean', 'Case-insensitive search (default: false)', false),
        this.createParam('max_results', 'number', `Max results to return (default: ${MAX_RESULTS})`, false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const rawPattern = params['pattern'];
    if (!rawPattern || typeof rawPattern !== 'string') {
      return this.failure('Missing or invalid required parameter: pattern (expected string)');
    }

    const rawGlob = params['glob'];
    const globPattern = typeof rawGlob === 'string' ? rawGlob : '**/*';
    const rawPath = params['path'];
    let searchDir: string;
    if (typeof rawPath === 'string') {
      const resolved = this.resolveSafePath(context.workingDirectory, rawPath);
      if (!resolved) {
        return this.failure('Path traversal denied: path escapes working directory');
      }
      searchDir = resolved;
    } else {
      searchDir = context.workingDirectory;
    }
    const caseInsensitive = params['case_insensitive'] === true;
    const rawMax = params['max_results'];
    const maxResults = typeof rawMax === 'number' && rawMax > 0 ? rawMax : MAX_RESULTS;

    let regex: RegExp;
    try {
      regex = new RegExp(rawPattern, caseInsensitive ? 'gi' : 'g');
    } catch {
      return this.failure(`Invalid regex pattern: ${rawPattern}`);
    }

    try {
      const files = await fastGlob(globPattern, {
        cwd: searchDir,
        absolute: false,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      });

      const matches: string[] = [];
      let filesSearched = 0;

      for (const file of files) {
        if (matches.length >= maxResults) break;

        const absolutePath = resolve(searchDir, file);
        try {
          const content = await readFile(absolutePath, 'utf-8');
          if (content.length > MAX_FILE_SIZE) continue;

          filesSearched++;
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) break;
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              const relPath = relative(context.workingDirectory, absolutePath);
              const start = Math.max(0, i - CONTEXT_LINES);
              const end = Math.min(lines.length - 1, i + CONTEXT_LINES);
              const snippet: string[] = [];

              for (let j = start; j <= end; j++) {
                const prefix = j === i ? '>' : ' ';
                snippet.push(`${prefix} ${j + 1}: ${lines[j]}`);
              }

              matches.push(`${relPath}:${i + 1}\n${snippet.join('\n')}`);
            }
          }
        } catch {
          // Skip unreadable files (binary, permission denied, etc.)
          continue;
        }
      }

      if (matches.length === 0) {
        return this.success(
          `No matches found for "${rawPattern}" in ${filesSearched} files`,
          { matchCount: 0, filesSearched }
        );
      }

      const output = matches.join('\n---\n');
      const truncated = matches.length >= maxResults ? ' (truncated)' : '';
      return this.success(
        `${matches.length} match(es) in ${filesSearched} files${truncated}:\n\n${output}`,
        { matchCount: matches.length, filesSearched }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.failure(`Search failed: ${msg}`);
    }
  }
}
