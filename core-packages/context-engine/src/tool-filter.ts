/**
 * Skill-scoped tool filtering.
 * Limits available tools to only those specified by the active skill.
 */

import type { ToolDescriptionRef } from '@core/types';

/** Wildcard value meaning "allow all tools" */
const WILDCARD = '*';

/**
 * Filter tools to only those allowed by the active skill.
 * If skillTools contains '*', all tools are returned.
 * Otherwise, only tools whose name appears in skillTools are kept.
 */
export function filterToolsBySkill(
  tools: readonly ToolDescriptionRef[],
  skillTools: readonly string[],
): ToolDescriptionRef[] {
  if (skillTools.includes(WILDCARD)) {
    return [...tools];
  }

  const allowedSet = new Set(skillTools);
  return tools.filter((tool) => allowedSet.has(tool.name));
}
