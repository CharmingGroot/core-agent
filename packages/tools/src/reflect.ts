import { BaseTool } from './base-tool.js';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';

/**
 * Skill guidelines definition used by the ReflectTool.
 */
export interface SkillGuidelines {
  readonly prompt: string;
  readonly rules: readonly string[];
  readonly tools: readonly string[];
}

/**
 * Provides skill guidelines to the ReflectTool.
 */
export interface SkillProvider {
  getSkillGuidelines(skillName: string): SkillGuidelines | undefined;
  getAvailableSkills(): string[];
}

/**
 * Built-in skill provider with hardcoded guidelines for common skills.
 */
class BuiltInSkillProvider implements SkillProvider {
  private readonly skills: Map<string, SkillGuidelines>;

  constructor() {
    this.skills = new Map<string, SkillGuidelines>();
    this.registerBuiltInSkills();
  }

  getSkillGuidelines(skillName: string): SkillGuidelines | undefined {
    return this.skills.get(skillName.toLowerCase());
  }

  getAvailableSkills(): string[] {
    return Array.from(this.skills.keys());
  }

  private registerBuiltInSkills(): void {
    this.skills.set('file-read', {
      prompt: 'Read files to understand content before taking action. Always verify file exists before processing.',
      rules: [
        'Use relative paths from working directory',
        'Check file encoding when dealing with non-UTF-8 files',
        'Do not attempt to read binary files',
        'Read the specific sections needed, not entire large files unnecessarily',
      ],
      tools: ['file_read'],
    });

    this.skills.set('file-write', {
      prompt: 'Write or modify files carefully. Always read before writing to understand existing content and conventions.',
      rules: [
        'Always read the target file before modifying it',
        'Preserve existing code style and conventions',
        'Modify only what was explicitly requested',
        'Create parent directories if they don\'t exist',
        'Never overwrite files without reading them first',
      ],
      tools: ['file_write'],
    });

    this.skills.set('file-search', {
      prompt: 'Search for files using glob patterns. Use precise patterns to minimize unnecessary results.',
      rules: [
        'Use specific glob patterns, avoid overly broad searches like **/*',
        'Exclude node_modules, .git, and build directories',
        'Limit results to what is actually needed',
        'Combine with file_read to verify search results',
      ],
      tools: ['file_search'],
    });

    this.skills.set('shell-exec', {
      prompt: 'Execute shell commands with caution. Prefer non-destructive, read-only commands when possible.',
      rules: [
        'Never execute destructive commands (rm -rf, drop, truncate) without explicit user approval',
        'Set appropriate timeouts for long-running commands',
        'Prefer read-only commands (ls, cat, git status) over mutating ones',
        'Validate command arguments before execution',
        'Do not pipe sensitive data to external services',
      ],
      tools: ['shell_exec'],
    });

    this.skills.set('code-review', {
      prompt: 'Analyze code for quality, security, and correctness. Search for relevant files first, then read and analyze.',
      rules: [
        'Search for related files before drawing conclusions',
        'Check for security vulnerabilities (injection, XSS, CSRF)',
        'Verify error handling is adequate',
        'Ensure consistent naming conventions',
        'Look for missing tests for modified code',
        'Do not suggest changes unrelated to the review scope',
      ],
      tools: ['file_read', 'file_search'],
    });

    this.skills.set('code-edit', {
      prompt: 'Modify code files following a strict read-verify-write cycle. Never write blindly.',
      rules: [
        'Always read the file before modifying it',
        'Make minimal, focused changes — do not refactor beyond scope',
        'Preserve existing code style and formatting',
        'Do not introduce security vulnerabilities',
        'Verify the edit achieved its intended purpose',
        'One logical change per edit operation',
      ],
      tools: ['file_read', 'file_write', 'file_search'],
    });
  }
}

/**
 * ReflectTool — Forces LLM self-evaluation against a skill's guidelines.
 *
 * This tool is a "mirror": it returns the skill's prompt and rules
 * as a structured checklist. The LLM then evaluates its own actions.
 *
 * Usage: After completing a skill (e.g., code-edit), call reflect
 * with the skill name to verify compliance.
 */
export class ReflectTool extends BaseTool {
  readonly name = 'reflect';
  readonly requiresPermission = false;

  private readonly skillProvider: SkillProvider;

  constructor(skillProvider?: SkillProvider) {
    super('reflect');
    this.skillProvider = skillProvider ?? new BuiltInSkillProvider();
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description:
        'Reflect on your recent actions against a skill\'s guidelines. Call this after completing a skill to verify you followed all instructions correctly.',
      parameters: [
        this.createParam(
          'skillName',
          'string',
          'The name of the skill to reflect against (e.g., "file-read", "code-edit", "shell-exec")',
          true,
        ),
      ],
    };
  }

  async run(params: JsonObject, _context: RunContext): Promise<ToolResult> {
    const skillName = params['skillName'];
    if (typeof skillName !== 'string' || !skillName.trim()) {
      return this.failure('Parameter "skillName" is required and must be a non-empty string');
    }

    const normalizedName = skillName.trim().toLowerCase();
    const skill = this.skillProvider.getSkillGuidelines(normalizedName);
    if (!skill) {
      const available = this.skillProvider.getAvailableSkills().join(', ');
      return this.failure(
        `No guidelines found for skill "${skillName}". Available skills: ${available}`,
      );
    }

    const output = this.buildReflectionPrompt(normalizedName, skill);
    return this.success(output);
  }

  private buildReflectionPrompt(skillName: string, skill: SkillGuidelines): string {
    const lines: string[] = [
      `=== REFLECTION: "${skillName}" skill ===`,
      '',
      'You just executed actions under this skill. Review your work against these guidelines:',
      '',
    ];

    if (skill.prompt) {
      lines.push('## Guidelines');
      lines.push(skill.prompt);
      lines.push('');
    }

    if (skill.rules.length > 0) {
      lines.push('## Checklist');
      for (const rule of skill.rules) {
        lines.push(`- [ ] ${rule}`);
      }
      lines.push('');
    }

    if (skill.tools.length > 0) {
      lines.push(`## Allowed Tools: ${skill.tools.join(', ')}`);
      lines.push('');
    }

    lines.push('## Instructions');
    lines.push('1. Review each checklist item against your recent actions');
    lines.push('2. If you violated any guideline, state which one and why');
    lines.push('3. If correction is needed, take corrective action immediately');
    lines.push('4. If all guidelines were followed, confirm compliance');

    return lines.join('\n');
  }
}
