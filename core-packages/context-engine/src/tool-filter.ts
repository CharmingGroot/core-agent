/**
 * Skill-scoped tool filtering.
 * Limits available tools to only those specified by the active skill.
 */

import type { ToolDescriptionRef, ToolAccessDecision } from '@core/types';

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

/**
 * Check if a tool name matches a pattern (supports trailing wildcard "github__*").
 */
function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) {
    return toolName.startsWith(pattern.slice(0, -1));
  }
  return toolName === pattern;
}

/**
 * Check if a tool name matches any pattern in a list.
 */
function matchesAny(toolName: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesPattern(toolName, p));
}

/**
 * Determine access decision for a tool based on profile rules.
 * Priority: denied > approvalRequired > allowed
 */
export function resolveToolAccess(
  toolName: string,
  profile: { allowedTools: readonly string[]; deniedTools: readonly string[]; approvalRequired: readonly string[] },
): ToolAccessDecision {
  // Denied takes highest priority
  if (matchesAny(toolName, profile.deniedTools)) return 'denied';
  // Check approval required
  if (matchesAny(toolName, profile.approvalRequired)) return 'requires_approval';
  // Check allowed
  if (matchesAny(toolName, profile.allowedTools)) return 'allowed';
  // Not in any list = denied
  return 'denied';
}

/**
 * Filter tools by profile — only tools with 'allowed' or 'requires_approval' pass through.
 * Denied tools are completely removed (LLM never sees them).
 */
export function filterToolsByProfile(
  tools: readonly ToolDescriptionRef[],
  profile: { allowedTools: readonly string[]; deniedTools: readonly string[]; approvalRequired: readonly string[] },
): ToolDescriptionRef[] {
  return tools.filter((tool) => {
    const decision = resolveToolAccess(tool.name, profile);
    return decision !== 'denied';
  });
}
