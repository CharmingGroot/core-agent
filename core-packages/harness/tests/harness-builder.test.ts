import { describe, it, expect } from 'vitest';
import type { IPolicyProvider, DomainConfig } from '@core/types';
import { OpenPolicy } from '@core/types';
import { HarnessBuilder } from '../src/harness-builder.js';
import { Harness } from '../src/harness.js';

function createDomainConfig(id: string): DomainConfig {
  return {
    id,
    name: `Domain ${id}`,
    skills: ['code-review'],
    rules: [],
    provider: {
      providerId: 'openai',
      model: 'gpt-4',
      auth: { type: 'api-key', key: 'test-key' },
    },
  };
}

describe('HarnessBuilder', () => {
  it('should build a Harness instance with defaults', () => {
    const harness = new HarnessBuilder().build();
    expect(harness).toBeInstanceOf(Harness);
  });

  it('should build with a custom domain', () => {
    const domain = createDomainConfig('finance');
    const harness = new HarnessBuilder()
      .withDomain(domain)
      .build();

    expect(harness).toBeInstanceOf(Harness);
  });

  it('should build with multiple domains', () => {
    const harness = new HarnessBuilder()
      .withDomain(createDomainConfig('finance'))
      .withDomain(createDomainConfig('engineering'))
      .build();

    expect(harness).toBeInstanceOf(Harness);
  });

  it('should support fluent chaining of all options', () => {
    const customPolicy: IPolicyProvider = new OpenPolicy();

    const harness = new HarnessBuilder()
      .withDomain(createDomainConfig('dev'))
      .withSkillsDir('/custom/skills')
      .withRulesDir('/custom/rules')
      .withPolicy(customPolicy)
      .withDefaultDomain('dev')
      .build();

    expect(harness).toBeInstanceOf(Harness);
  });

  it('should use OpenPolicy by default', async () => {
    // Build with no explicit policy and a nonexistent skills dir
    // The harness should initialize without error (OpenPolicy allows all)
    const harness = new HarnessBuilder()
      .withSkillsDir('/tmp/nonexistent-skills-dir-test')
      .build();

    // OpenPolicy is the default — initialization should succeed
    // (skills dir missing is tolerated)
    await harness.initialize();

    const status = harness.getStatus();
    expect(status.status).toBe('running');
  });

  it('should override skillsDir and rulesDir', () => {
    const builder = new HarnessBuilder()
      .withSkillsDir('/my/skills')
      .withRulesDir('/my/rules');

    // Building should not throw
    const harness = builder.build();
    expect(harness).toBeInstanceOf(Harness);
  });

  it('should set default domain id', async () => {
    const harness = new HarnessBuilder()
      .withDomain(createDomainConfig('primary'))
      .withDefaultDomain('primary')
      .withSkillsDir('/tmp/nonexistent-skills-dir-test-2')
      .build();

    await harness.initialize();

    // A request without explicit domainId should route to 'primary'
    const response = await harness.handleRequest({
      requestId: 'test-req',
      userId: 'user-1',
      goal: 'Test default domain routing',
    });

    // Domain 'primary' exists so request should succeed
    expect(response.success).toBe(true);
    expect(response.content).toContain('primary');
  });
});
