import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type {
  IPolicyProvider,
  DomainConfig,
  HarnessConfig,
  HarnessRequest,
} from '@core/types';
import { OpenPolicy } from '@core/types';
import { Harness } from '../src/harness.js';

const SAMPLE_SKILL_MD = `# code-review

## Description
A code review skill.

## Tools
- read_file
- write_file

## Prompt
You are a code review assistant.
`;

const DEPLOY_SKILL_MD = `# deploy

## Description
A deployment skill.

## Tools
- run_deploy

## Prompt
You handle deployments.
`;

function createProviderConfig(): DomainConfig['provider'] {
  return {
    providerId: 'openai',
    model: 'gpt-4',
    auth: { type: 'api-key', key: 'test-key' },
  };
}

function createDomainConfig(
  id: string,
  skills: readonly string[],
): DomainConfig {
  return {
    id,
    name: `Domain ${id}`,
    skills,
    rules: [],
    provider: createProviderConfig(),
  };
}

function createRequest(overrides: Partial<HarnessRequest> = {}): HarnessRequest {
  return {
    requestId: 'req-001',
    userId: 'user-1',
    goal: 'Review the code',
    ...overrides,
  };
}

describe('Harness', () => {
  let tempDir: string;
  let skillsDir: string;
  let rulesDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'harness-test-'));
    skillsDir = join(tempDir, 'skills');
    rulesDir = join(tempDir, 'rules');
    await mkdir(skillsDir, { recursive: true });
    await mkdir(rulesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function buildConfig(domains: DomainConfig[], defaultDomainId?: string): HarnessConfig {
    return {
      domains,
      defaultDomainId,
      skillsDir,
      rulesDir,
    };
  }

  it('should initialize and load skills from skillsDir', async () => {
    await writeFile(join(skillsDir, 'code-review.skill.md'), SAMPLE_SKILL_MD);

    const config = buildConfig([createDomainConfig('dev', ['code-review'])]);
    const harness = new Harness(config, new OpenPolicy());

    await harness.initialize();

    const status = harness.getStatus();
    expect(status.status).toBe('running');
    expect(status.domains).toHaveLength(1);
    expect(status.domains[0].domainId).toBe('dev');
    expect(status.domains[0].skills).toEqual(['code-review']);
  });

  it('should throw when initialized twice', async () => {
    const config = buildConfig([]);
    const harness = new Harness(config, new OpenPolicy());

    await harness.initialize();
    await expect(harness.initialize()).rejects.toThrow('already initialized');
  });

  it('should throw when handling request before initialization', async () => {
    const config = buildConfig([]);
    const harness = new Harness(config, new OpenPolicy());

    await expect(
      harness.handleRequest(createRequest()),
    ).rejects.toThrow('not initialized');
  });

  it('should route request to the correct domain', async () => {
    await writeFile(join(skillsDir, 'code-review.skill.md'), SAMPLE_SKILL_MD);
    await writeFile(join(skillsDir, 'deploy.skill.md'), DEPLOY_SKILL_MD);

    const config = buildConfig([
      createDomainConfig('dev', ['code-review']),
      createDomainConfig('ops', ['deploy']),
    ]);
    const harness = new Harness(config, new OpenPolicy());
    await harness.initialize();

    const response = await harness.handleRequest(
      createRequest({ domainId: 'ops', goal: 'Deploy the app' }),
    );

    expect(response.success).toBe(true);
    expect(response.content).toContain('ops');
    expect(response.content).toContain('deploy');
  });

  it('should use default domain when request has no domainId', async () => {
    await writeFile(join(skillsDir, 'code-review.skill.md'), SAMPLE_SKILL_MD);

    const config = buildConfig(
      [createDomainConfig('dev', ['code-review'])],
      'dev',
    );
    const harness = new Harness(config, new OpenPolicy());
    await harness.initialize();

    const response = await harness.handleRequest(
      createRequest({ domainId: undefined }),
    );

    expect(response.success).toBe(true);
    expect(response.content).toContain('dev');
  });

  it('should return error when no domain can be resolved', async () => {
    const config = buildConfig([createDomainConfig('dev', ['code-review'])]);
    const harness = new Harness(config, new OpenPolicy());
    await harness.initialize();

    const response = await harness.handleRequest(
      createRequest({ domainId: undefined }),
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain('No domain specified');
  });

  it('should return error when domain is not found', async () => {
    const config = buildConfig(
      [createDomainConfig('dev', ['code-review'])],
      'dev',
    );
    const harness = new Harness(config, new OpenPolicy());
    await harness.initialize();

    const response = await harness.handleRequest(
      createRequest({ domainId: 'nonexistent' }),
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain('not found');
  });

  it('should deny request when policy rejects', async () => {
    await writeFile(join(skillsDir, 'code-review.skill.md'), SAMPLE_SKILL_MD);

    const denyPolicy: IPolicyProvider = {
      ...new OpenPolicy(),
      canUseSkill: async () => false,
      canUseTool: async () => false,
      requiresApproval: async () => false,
      requestApproval: async () => ({
        status: 'denied' as const,
        reason: 'denied by policy',
        timestamp: new Date(),
      }),
      recordAction: async () => {},
      getAllowedSkills: async () => [],
      getAllowedTools: async () => [],
    };

    const config = buildConfig(
      [createDomainConfig('dev', ['code-review'])],
      'dev',
    );
    const harness = new Harness(config, denyPolicy);
    await harness.initialize();

    const response = await harness.handleRequest(createRequest());

    expect(response.success).toBe(false);
    expect(response.error).toContain('not authorized');
  });

  it('should gracefully handle missing skillsDir', async () => {
    const config: HarnessConfig = {
      domains: [createDomainConfig('dev', ['code-review'])],
      skillsDir: join(tempDir, 'nonexistent-skills'),
      rulesDir,
    };
    const harness = new Harness(config, new OpenPolicy());

    // Should not throw — missing dir is tolerated
    await harness.initialize();

    const status = harness.getStatus();
    expect(status.status).toBe('running');
  });

  it('should shutdown and reset status', async () => {
    const config = buildConfig([]);
    const harness = new Harness(config, new OpenPolicy());
    await harness.initialize();

    await harness.shutdown();

    const status = harness.getStatus();
    expect(status.status).toBe('idle');
    expect(status.domains).toHaveLength(0);
  });

  it('should track request counts per domain', async () => {
    await writeFile(join(skillsDir, 'code-review.skill.md'), SAMPLE_SKILL_MD);

    const config = buildConfig(
      [createDomainConfig('dev', ['code-review'])],
      'dev',
    );
    const harness = new Harness(config, new OpenPolicy());
    await harness.initialize();

    await harness.handleRequest(createRequest({ requestId: 'r1' }));
    await harness.handleRequest(createRequest({ requestId: 'r2' }));

    const status = harness.getStatus();
    expect(status.domains[0].totalRequests).toBe(2);
    expect(status.domains[0].activeSessions).toBe(0);
  });
});
