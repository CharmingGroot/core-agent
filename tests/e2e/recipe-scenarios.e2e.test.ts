/**
 * Recipe Scenario Tests
 *
 * Each test mirrors a README recipe — verifying that the documented
 * package combinations actually work end-to-end.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadEnv } from './setup.js';

let env: Record<string, string>;
beforeAll(async () => {
  env = await loadEnv();
});

// ─────────────────────────────────────────────────────────────────────
// Recipe 1: LLM API 래퍼만 (core + providers)
// ─────────────────────────────────────────────────────────────────────
describe('Recipe 1: LLM API wrapper', () => {
  it('should chat with OpenAI provider', async () => {
    const apiKey = env['OPENAI_API_KEY'];
    if (!apiKey) {
      console.log('Skipping: OPENAI_API_KEY not set');
      return;
    }

    const { createProvider } = await import('@cli-agent/providers');
    const { apiKeyAuth } = await import('@cli-agent/core');

    const provider = createProvider({
      providerId: 'openai',
      model: 'gpt-4o-mini',
      auth: apiKeyAuth(apiKey),
      maxTokens: 256,
      temperature: 0,
    });

    const response = await provider.chat([
      { role: 'user', content: 'Reply with just the word "hello".' },
    ]);

    expect(response.content.toLowerCase()).toContain('hello');
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
  }, 30000);

  it('should stream from OpenAI provider', async () => {
    const apiKey = env['OPENAI_API_KEY'];
    if (!apiKey) {
      console.log('Skipping: OPENAI_API_KEY not set');
      return;
    }

    const { createProvider } = await import('@cli-agent/providers');
    const { apiKeyAuth } = await import('@cli-agent/core');

    const provider = createProvider({
      providerId: 'openai',
      model: 'gpt-4o-mini',
      auth: apiKeyAuth(apiKey),
      maxTokens: 256,
      temperature: 0,
    });

    const chunks: string[] = [];
    for await (const event of provider.stream([
      { role: 'user', content: 'Count from 1 to 5.' },
    ])) {
      if (event.type === 'text_delta' && event.content) {
        chunks.push(event.content);
      }
    }

    const full = chunks.join('');
    expect(full).toContain('1');
    expect(full).toContain('5');
    expect(chunks.length).toBeGreaterThan(1); // actually streamed
  }, 30000);
});

// ─────────────────────────────────────────────────────────────────────
// Recipe 3: 커스텀 도구 (core만으로 ITool 구현)
// ─────────────────────────────────────────────────────────────────────
describe('Recipe 3: Custom tool', () => {
  it('should create and execute a custom ITool without @cli-agent/tools', async () => {
    const { Registry, RunContext } = await import('@cli-agent/core');

    // Custom tool — no dependency on @cli-agent/tools
    const calculatorTool = {
      name: 'calculator',
      requiresPermission: false,
      describe() {
        return {
          name: 'calculator',
          description: 'Evaluate a simple math expression',
          parameters: [
            { name: 'expression', type: 'string', description: 'Math expression', required: true },
          ],
        };
      },
      async execute(params: Record<string, unknown>) {
        const expr = params['expression'];
        if (typeof expr !== 'string') {
          return { success: false, output: '', error: 'Missing expression' };
        }
        if (!/^[\d\s+\-*/().]+$/.test(expr)) {
          return { success: false, output: '', error: 'Invalid expression' };
        }
        const result = new Function(`return (${expr})`)() as number;
        return { success: true, output: String(result) };
      },
    };

    // Register in a Registry
    const registry = new Registry('Tool');
    registry.register('calculator', calculatorTool);

    // Verify describe
    const desc = calculatorTool.describe();
    expect(desc.name).toBe('calculator');
    expect(desc.parameters).toHaveLength(1);

    // Execute
    const config = {
      provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: '' }, maxTokens: 1024, temperature: 0 },
      maxIterations: 1,
      workingDirectory: process.cwd(),
    };
    const context = new RunContext(config);
    const result = await calculatorTool.execute({ expression: '(2 + 3) * 4' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toBe('20');

    // Verify registry lookup
    const found = registry.get('calculator');
    expect(found.name).toBe('calculator');
  });

  it('should create a custom tool using BaseTool from @cli-agent/tools', async () => {
    const { BaseTool } = await import('@cli-agent/tools');
    const { RunContext } = await import('@cli-agent/core');

    class GreeterTool extends BaseTool {
      readonly name = 'greeter';
      readonly requiresPermission = false;

      describe() {
        return {
          name: this.name,
          description: 'Greet someone',
          parameters: [
            this.createParam('name', 'string', 'Name to greet', true),
          ],
        };
      }

      async run(params: Record<string, unknown>) {
        const name = params['name'];
        if (typeof name !== 'string') return this.failure('Missing name');
        return this.success(`Hello, ${name}!`);
      }
    }

    const tool = new GreeterTool();
    const config = {
      provider: { providerId: 'test', model: 'test', auth: { type: 'api-key' as const, apiKey: '' }, maxTokens: 1024, temperature: 0 },
      maxIterations: 1,
      workingDirectory: process.cwd(),
    };
    const context = new RunContext(config);
    const result = await tool.execute({ name: 'AgentCore' }, context);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello, AgentCore!');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Recipe 6: 규칙 엔진만 (@core/types + @core/rule)
// ─────────────────────────────────────────────────────────────────────
describe('Recipe 6: Rule engine only', () => {
  it('should block destructive commands with NoDestructiveCommandRule', async () => {
    const { RuleRegistry, RuleEngine, NoDestructiveCommandRule } = await import('@core/rule');

    const registry = new RuleRegistry();
    registry.register(new NoDestructiveCommandRule());

    const engine = new RuleEngine(registry);

    const baseContext = {
      agentId: 'agent-1',
      skillName: 'default',
      userId: 'user-1',
      metadata: {},
    };

    const dangerousResult = await engine.evaluatePre({
      ...baseContext,
      toolName: 'shell_exec',
      toolParams: { command: 'rm -rf /' },
    });

    expect(dangerousResult.allowed).toBe(false);
    expect(dangerousResult.reason).toBeTruthy();

    const safeResult = await engine.evaluatePre({
      ...baseContext,
      toolName: 'shell_exec',
      toolParams: { command: 'ls -la' },
    });

    expect(safeResult.allowed).toBe(true);
  });

  it('should redact PII with PiiRedactRule', async () => {
    const { RuleRegistry, RuleEngine, PiiRedactRule } = await import('@core/rule');

    const registry = new RuleRegistry();
    registry.register(new PiiRedactRule());

    const engine = new RuleEngine(registry);

    const result = await engine.evaluatePost({
      agentId: 'agent-1',
      skillName: 'default',
      toolName: 'file_read',
      toolParams: {},
      userId: 'user-1',
      toolResult: {
        success: true,
        output: 'Contact me at user@example.com or 010-1234-5678',
        durationMs: 10,
      },
      metadata: {},
    });

    // PiiRedactRule should filter the output
    expect(result.filteredOutput).toBeDefined();
    expect(result.filteredOutput).not.toContain('user@example.com');
    expect(result.filteredOutput).not.toContain('010-1234-5678');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Recipe 7: 거버넌스 (RBAC + 정책)
// ─────────────────────────────────────────────────────────────────────
describe('Recipe 7: Governance', () => {
  it('should enforce role-based tool access with GovernedPolicy', async () => {
    const { GovernedPolicy, InMemoryGovernanceStore, GovernanceAdmin } = await import('@core/governance');

    const store = new InMemoryGovernanceStore();
    const policy = new GovernedPolicy(store);
    const admin = new GovernanceAdmin(store);

    // Create a role with allowed tools and approval policy
    await store.createRole({
      name: 'backend-dev',
      description: 'Backend developer role',
      allowedSkills: [],
      allowedTools: ['file_read', 'file_write', 'shell_exec'],
      policy: {
        approvalRequired: ['shell_exec'],
        maxToolCallsPerSession: 100,
        auditLevel: 'basic',
        allowedProviders: ['*'],
        dataClassification: 'internal',
      },
    });

    // Create user and assign role
    await admin.createUser('user-1', 'developer');
    await admin.assignRole('user-1', 'backend-dev');

    // Check permissions
    const canRead = await policy.canUseTool('user-1', 'file_read');
    const canDelete = await policy.canUseTool('user-1', 'db_drop_table');
    const needsApproval = await policy.requiresApproval('user-1', 'shell_exec');

    expect(canRead).toBe(true);
    expect(canDelete).toBe(false);
    expect(needsApproval).toBe(true);
  });

  it('should allow everything with OpenPolicy (standalone)', async () => {
    const { OpenPolicy } = await import('@core/types');

    const policy = new OpenPolicy();

    expect(await policy.canUseTool('anyone', 'anything')).toBe(true);
    expect(await policy.requiresApproval('anyone', 'anything')).toBe(false);
    expect(await policy.getProfile('anyone')).toBeNull();
  });

  it('should integrate permission handler with rule engine and governance', async () => {
    const { createPermissionHandler } = await import('@core/harness');
    const { GovernedPolicy, InMemoryGovernanceStore, GovernanceAdmin } = await import('@core/governance');
    const { RuleRegistry, RuleEngine, NoDestructiveCommandRule } = await import('@core/rule');

    // Setup governance
    const store = new InMemoryGovernanceStore();
    const policy = new GovernedPolicy(store);
    const admin = new GovernanceAdmin(store);

    // Create role and assign to user
    await store.createRole({
      name: 'dev',
      description: 'Developer role',
      allowedSkills: [],
      allowedTools: ['shell_exec', 'file_read'],
      policy: {
        approvalRequired: [],
        maxToolCallsPerSession: 100,
        auditLevel: 'basic',
        allowedProviders: ['*'],
        dataClassification: 'internal',
      },
    });
    await admin.createUser('user-1', 'developer');
    await admin.assignRole('user-1', 'dev');

    // Setup rule engine
    const ruleRegistry = new RuleRegistry();
    ruleRegistry.register(new NoDestructiveCommandRule());
    const ruleEngine = new RuleEngine(ruleRegistry);

    // Create composed handler
    const handler = createPermissionHandler({
      policy,
      userId: 'user-1',
      ruleEngine,
    });

    // Safe command → allowed
    const safeResult = await handler('shell_exec', { command: 'ls -la' });
    expect(safeResult).not.toBe('deny');

    // Dangerous command → blocked by rule engine
    const dangerousResult = await handler('shell_exec', { command: 'rm -rf /' });
    expect(dangerousResult).toBe('deny');

    // Unauthorized tool → blocked by governance
    const unauthorizedResult = await handler('db_drop', { table: 'users' });
    expect(unauthorizedResult).toBe('deny');
  });
});
