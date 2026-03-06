import { describe, it, expect } from 'vitest';
import { filterToolsBySkill } from '../src/tool-filter.js';
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
