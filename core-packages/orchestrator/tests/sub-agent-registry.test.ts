import { describe, it, expect, beforeEach } from 'vitest';
import { SubAgentRegistry } from '../src/sub-agent-registry.js';
import type { SubAgentDescriptor } from '@core/types';

function createAgent(id: string, description: string): SubAgentDescriptor {
  return {
    id,
    description,
    skillName: `skill-${id}`,
    parameters: [
      { name: 'input', type: 'string', description: 'input data', required: true },
      { name: 'verbose', type: 'boolean', description: 'verbose mode', required: false },
    ],
  };
}

describe('SubAgentRegistry', () => {
  let registry: SubAgentRegistry;

  beforeEach(() => {
    registry = new SubAgentRegistry();
  });

  it('should register and retrieve a sub-agent', () => {
    const agent = createAgent('agent_1', 'First agent');
    registry.register(agent);

    const retrieved = registry.get('agent_1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('agent_1');
    expect(retrieved?.description).toBe('First agent');
  });

  it('should return undefined for unknown agent id', () => {
    const result = registry.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('should return all registered agents', () => {
    registry.register(createAgent('a1', 'Agent 1'));
    registry.register(createAgent('a2', 'Agent 2'));
    registry.register(createAgent('a3', 'Agent 3'));

    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('should unregister an agent and return true', () => {
    registry.register(createAgent('a1', 'Agent 1'));

    const removed = registry.unregister('a1');
    expect(removed).toBe(true);
    expect(registry.get('a1')).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it('should return false when unregistering nonexistent agent', () => {
    const removed = registry.unregister('nonexistent');
    expect(removed).toBe(false);
  });

  it('should overwrite agent with same id on re-register', () => {
    registry.register(createAgent('a1', 'Original'));
    registry.register(createAgent('a1', 'Updated'));

    expect(registry.size).toBe(1);
    expect(registry.get('a1')?.description).toBe('Updated');
  });

  it('should convert agents to tool descriptions', () => {
    registry.register(createAgent('agent_review', 'Code review'));
    registry.register(createAgent('agent_deploy', 'Deploy app'));

    const tools = registry.toToolDescriptions();

    expect(tools).toHaveLength(2);

    const reviewTool = tools.find((t) => t.name === 'agent_review');
    expect(reviewTool).toBeDefined();
    expect(reviewTool?.description).toBe('Code review');
    expect(reviewTool?.parameters).toHaveLength(2);
    expect(reviewTool?.parameters[0].name).toBe('input');
    expect(reviewTool?.tokenEstimate).toBeGreaterThan(0);
  });

  it('should report correct size', () => {
    expect(registry.size).toBe(0);

    registry.register(createAgent('a1', 'Agent 1'));
    expect(registry.size).toBe(1);

    registry.register(createAgent('a2', 'Agent 2'));
    expect(registry.size).toBe(2);

    registry.unregister('a1');
    expect(registry.size).toBe(1);
  });
});
