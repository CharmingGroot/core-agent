import type {
  ITool,
  ToolDescription,
  ToolResult,
  JsonObject,
  AgentLogger,
} from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';
import { createChildLogger } from '@cli-agent/core';

/** Minimal skill shape — avoids hard dependency on @core/types */
export interface SkillEntry {
  readonly name: string;
  readonly description: string;
  readonly tools: readonly string[];
  readonly prompt: string;
  readonly rules: readonly string[];
}

/** Minimal registry interface — compatible with @core/skill SkillRegistry */
export interface SkillProvider {
  get(name: string): SkillEntry | undefined;
  getAll(): readonly SkillEntry[];
}

/**
 * An ITool that exposes the skill registry to the agent.
 *
 * Actions:
 *   - "list"  → returns all available skill names and descriptions
 *   - "invoke" → returns the skill's prompt, tools, and rules so the
 *                 agent can adopt that behavior for the current task
 *
 * This enables CLI-style `/skill` invocation: the agent discovers
 * available skills and activates one by reading its prompt guidance.
 */
export class SkillTool implements ITool {
  readonly name = 'skill';
  readonly requiresPermission = false;

  private readonly registry: SkillProvider;
  private readonly logger: AgentLogger;

  constructor(registry: SkillProvider) {
    this.registry = registry;
    this.logger = createChildLogger('skill-tool');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description:
        'List or invoke predefined skills. ' +
        'Use action="list" to see available skills, ' +
        'or action="invoke" with name="<skill>" to activate a skill.',
      parameters: [
        {
          name: 'action',
          type: 'string',
          description: 'Action to perform: "list" or "invoke"',
          required: true,
        },
        {
          name: 'name',
          type: 'string',
          description: 'Skill name (required for "invoke")',
          required: false,
        },
        {
          name: 'input',
          type: 'string',
          description: 'Optional context/input to pass to the skill',
          required: false,
        },
      ],
    };
  }

  async execute(params: JsonObject, _context: RunContext): Promise<ToolResult> {
    const action = params['action'];

    if (action === 'list') {
      return this.listSkills();
    }

    if (action === 'invoke') {
      const name = params['name'];
      if (typeof name !== 'string' || name.trim().length === 0) {
        return { success: false, output: '', error: 'Missing "name" parameter for invoke action' };
      }
      const input = typeof params['input'] === 'string' ? params['input'] : undefined;
      return this.invokeSkill(name, input);
    }

    return {
      success: false,
      output: '',
      error: `Unknown action: "${String(action)}". Use "list" or "invoke".`,
    };
  }

  private listSkills(): ToolResult {
    const skills = this.registry.getAll();
    if (skills.length === 0) {
      return { success: true, output: 'No skills available.' };
    }

    const lines = skills.map(
      (s) => `- ${s.name}: ${s.description} [tools: ${s.tools.join(', ')}]`
    );

    this.logger.debug({ count: skills.length }, 'Listed skills');
    return { success: true, output: `Available skills:\n${lines.join('\n')}` };
  }

  private invokeSkill(name: string, input?: string): ToolResult {
    const skill = this.registry.get(name);
    if (!skill) {
      return { success: false, output: '', error: `Skill "${name}" not found` };
    }

    this.logger.info({ skill: name }, 'Skill invoked');

    const sections: string[] = [
      `## Skill: ${skill.name}`,
      '',
      skill.description,
      '',
      '### Prompt',
      skill.prompt,
    ];

    if (skill.tools.length > 0) {
      sections.push('', `### Available tools: ${skill.tools.join(', ')}`);
    }

    if (skill.rules.length > 0) {
      sections.push('', `### Rules: ${skill.rules.join(', ')}`);
    }

    if (input) {
      sections.push('', `### User input`, input);
    }

    return {
      success: true,
      output: sections.join('\n'),
      metadata: {
        skillName: skill.name,
        tools: [...skill.tools],
        rules: [...skill.rules],
      },
    };
  }
}
