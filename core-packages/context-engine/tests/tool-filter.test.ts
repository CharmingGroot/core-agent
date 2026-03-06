import { describe, it, expect } from 'vitest';
import { filterToolsBySkill, resolveToolAccess, filterToolsByProfile } from '../src/tool-filter.js';
import type { ToolDescriptionRef } from '@core/types';

function makeTool(name: string): ToolDescriptionRef {
  return {
    name,
    description: `Description for ${name}`,
    parameters: [],
    tokenEstimate: 10,
  };
}

describe('filterToolsBySkill', () => {
  const allTools: ToolDescriptionRef[] = [
    makeTool('readFile'),
    makeTool('writeFile'),
    makeTool('search'),
    makeTool('deploy'),
    makeTool('monitor'),
  ];

  it('should return all tools when skillTools contains wildcard', () => {
    const result = filterToolsBySkill(allTools, ['*']);
    expect(result).toHaveLength(5);
    expect(result.map((t) => t.name)).toEqual([
      'readFile',
      'writeFile',
      'search',
      'deploy',
      'monitor',
    ]);
  });

  it('should filter to only matching tool names', () => {
    const result = filterToolsBySkill(allTools, ['readFile', 'search']);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toEqual(['readFile', 'search']);
  });

  it('should return empty array when no tools match', () => {
    const result = filterToolsBySkill(allTools, ['nonexistent']);
    expect(result).toHaveLength(0);
  });

  it('should return empty array for empty skillTools', () => {
    const result = filterToolsBySkill(allTools, []);
    expect(result).toHaveLength(0);
  });

  it('should handle empty tools list', () => {
    const result = filterToolsBySkill([], ['readFile']);
    expect(result).toHaveLength(0);
  });

  it('should preserve tool objects when filtering', () => {
    const result = filterToolsBySkill(allTools, ['deploy']);
    expect(result[0]).toEqual(allTools[3]);
  });

  it('should treat wildcard alongside other names as wildcard', () => {
    const result = filterToolsBySkill(allTools, ['readFile', '*']);
    expect(result).toHaveLength(5);
  });

  it('should not return duplicates even if tool name appears twice in skillTools', () => {
    const result = filterToolsBySkill(allTools, ['readFile', 'readFile']);
    expect(result).toHaveLength(1);
  });
});

describe('resolveToolAccess', () => {
  it('should return allowed for a tool in allowedTools', () => {
    const profile = { allowedTools: ['readFile'], deniedTools: [], approvalRequired: [] };
    expect(resolveToolAccess('readFile', profile)).toBe('allowed');
  });

  it('should return denied for a tool in deniedTools', () => {
    const profile = { allowedTools: [], deniedTools: ['deploy'], approvalRequired: [] };
    expect(resolveToolAccess('deploy', profile)).toBe('denied');
  });

  it('should return denied when deniedTools overrides allowedTools', () => {
    const profile = { allowedTools: ['deploy'], deniedTools: ['deploy'], approvalRequired: [] };
    expect(resolveToolAccess('deploy', profile)).toBe('denied');
  });

  it('should return requires_approval for a tool in approvalRequired', () => {
    const profile = { allowedTools: ['deploy'], deniedTools: [], approvalRequired: ['deploy'] };
    expect(resolveToolAccess('deploy', profile)).toBe('requires_approval');
  });

  it('should return denied when deniedTools overrides approvalRequired', () => {
    const profile = { allowedTools: [], deniedTools: ['deploy'], approvalRequired: ['deploy'] };
    expect(resolveToolAccess('deploy', profile)).toBe('denied');
  });

  it('should return denied for a tool not in any list', () => {
    const profile = { allowedTools: ['readFile'], deniedTools: [], approvalRequired: [] };
    expect(resolveToolAccess('unknown', profile)).toBe('denied');
  });

  it('should support wildcard patterns in allowedTools', () => {
    const profile = { allowedTools: ['github__*'], deniedTools: [], approvalRequired: [] };
    expect(resolveToolAccess('github__list_repos', profile)).toBe('allowed');
    expect(resolveToolAccess('github__create_issue', profile)).toBe('allowed');
    expect(resolveToolAccess('slack__send', profile)).toBe('denied');
  });

  it('should support wildcard patterns in deniedTools', () => {
    const profile = { allowedTools: ['*'], deniedTools: ['deploy__*'], approvalRequired: [] };
    expect(resolveToolAccess('deploy__production', profile)).toBe('denied');
    expect(resolveToolAccess('readFile', profile)).toBe('allowed');
  });

  it('should support wildcard "*" to allow everything', () => {
    const profile = { allowedTools: ['*'], deniedTools: [], approvalRequired: [] };
    expect(resolveToolAccess('anything', profile)).toBe('allowed');
  });
});

describe('filterToolsByProfile', () => {
  const allTools: ToolDescriptionRef[] = [
    makeTool('github__list_repos'),
    makeTool('github__create_issue'),
    makeTool('slack__send'),
    makeTool('deploy__production'),
    makeTool('readFile'),
  ];

  it('should return only allowed tools', () => {
    const profile = { allowedTools: ['readFile', 'slack__send'], deniedTools: [], approvalRequired: [] };
    const result = filterToolsByProfile(allTools, profile);
    expect(result.map((t) => t.name)).toEqual(['slack__send', 'readFile']);
  });

  it('should support wildcard patterns', () => {
    const profile = { allowedTools: ['github__*'], deniedTools: [], approvalRequired: [] };
    const result = filterToolsByProfile(allTools, profile);
    expect(result.map((t) => t.name)).toEqual(['github__list_repos', 'github__create_issue']);
  });

  it('should exclude denied tools even if allowed', () => {
    const profile = { allowedTools: ['*'], deniedTools: ['deploy__production'], approvalRequired: [] };
    const result = filterToolsByProfile(allTools, profile);
    expect(result).toHaveLength(4);
    expect(result.map((t) => t.name)).not.toContain('deploy__production');
  });

  it('should keep approval-required tools (not filter them out)', () => {
    const profile = { allowedTools: ['readFile'], deniedTools: [], approvalRequired: ['slack__send'] };
    const result = filterToolsByProfile(allTools, profile);
    expect(result.map((t) => t.name)).toEqual(['slack__send', 'readFile']);
  });

  it('should deny all tools when profile lists are empty', () => {
    const profile = { allowedTools: [], deniedTools: [], approvalRequired: [] };
    const result = filterToolsByProfile(allTools, profile);
    expect(result).toHaveLength(0);
  });

  it('should allow everything with wildcard "*"', () => {
    const profile = { allowedTools: ['*'], deniedTools: [], approvalRequired: [] };
    const result = filterToolsByProfile(allTools, profile);
    expect(result).toHaveLength(5);
  });
});
