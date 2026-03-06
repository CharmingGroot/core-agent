/**
 * Harness — Main entry point for the orchestration system.
 *
 * Wires together domains, skills, rules, orchestrator, and policy.
 * Acts as the composition root: reads domain configs, loads skills from
 * .skill.md files, creates per-domain orchestrators, and routes requests.
 */
import type {
  IPolicyProvider,
  HarnessConfig,
  HarnessRequest,
  HarnessResponse,
  HarnessStatus,
  DomainStatus,
  DomainConfig,
  IOperationTracker,
} from '@core/types';
import { SkillLoader, SkillRegistry } from '@core/skill';
import { RuleRegistry } from '@core/rule';
import {
  Orchestrator,
  SubAgentRegistry,
  type ISubAgentExecutor,
  type OrchestratorResult,
} from '@core/orchestrator';
import { DomainManager } from './domain-manager.js';
import { InMemoryOperationTracker } from './operation-tracker.js';

/** Per-domain runtime state tracked by the harness */
interface DomainRuntime {
  readonly config: DomainConfig;
  readonly skillRegistry: SkillRegistry;
  readonly ruleRegistry: RuleRegistry;
  totalRequests: number;
  activeSessions: number;
}

/**
 * Main harness class that orchestrates the entire system.
 *
 * Lifecycle:
 *   1. Construct with HarnessConfig + IPolicyProvider
 *   2. Call initialize() to load skills, rules, and set up domains
 *   3. Call handleRequest() to process incoming requests
 *   4. Call shutdown() to clean up
 */
export class Harness {
  private readonly config: HarnessConfig;
  private readonly policy: IPolicyProvider;
  private readonly domainManager: DomainManager;
  private readonly domainRuntimes: Map<string, DomainRuntime> = new Map();
  private readonly globalSkillRegistry: SkillRegistry;
  private readonly globalRuleRegistry: RuleRegistry;
  private readonly executor: ISubAgentExecutor | undefined;
  private readonly operationTracker: IOperationTracker;
  private status: HarnessStatus = 'idle';
  private initialized = false;

  constructor(
    config: HarnessConfig,
    policy: IPolicyProvider,
    executor?: ISubAgentExecutor,
    operationTracker?: IOperationTracker,
  ) {
    this.config = config;
    this.policy = policy;
    this.executor = executor;
    this.operationTracker = operationTracker ?? new InMemoryOperationTracker();
    this.domainManager = new DomainManager();
    this.globalSkillRegistry = new SkillRegistry();
    this.globalRuleRegistry = new RuleRegistry();
  }

  /**
   * Initializes the harness:
   * - Loads all skills from skillsDir
   * - Registers domains from config
   * - Creates per-domain scoped registries
   *
   * @throws if already initialized or if skill loading fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('Harness is already initialized');
    }

    this.status = 'running';

    // Load skills from the configured directory
    await this.loadSkills();

    // Register each domain and create its runtime
    for (const domainConfig of this.config.domains) {
      this.domainManager.registerDomain(domainConfig);
      this.createDomainRuntime(domainConfig);
    }

    this.initialized = true;
  }

  /**
   * Routes a request to the correct domain, checks policy,
   * and returns a response.
   *
   * Domain resolution order:
   *   1. request.domainId (explicit)
   *   2. config.defaultDomainId (fallback)
   *   3. Error if no domain can be resolved
   */
  async handleRequest(request: HarnessRequest): Promise<HarnessResponse> {
    this.ensureInitialized();
    const startTime = Date.now();

    // Resolve domain
    const domainId = request.domainId ?? this.config.defaultDomainId;

    if (!domainId) {
      return this.buildErrorResponse(
        request.requestId,
        'No domain specified and no default domain configured',
        startTime,
      );
    }

    const runtime = this.domainRuntimes.get(domainId);

    if (!runtime) {
      return this.buildErrorResponse(
        request.requestId,
        `Domain "${domainId}" not found`,
        startTime,
      );
    }

    // Check policy: can this user use this domain's skills?
    const canUse = await this.policy.canUseSkill(
      request.userId,
      domainId,
    );

    if (!canUse) {
      return this.buildErrorResponse(
        request.requestId,
        `User "${request.userId}" is not authorized for domain "${domainId}"`,
        startTime,
      );
    }

    // Create operation for tracking
    const operationId = this.operationTracker.create({
      requestId: request.requestId,
      userId: request.userId,
      domainId,
      goal: request.goal,
    });

    this.operationTracker.start(operationId);

    // Record the action in audit log
    await this.policy.recordAction({
      timestamp: new Date(),
      runId: request.requestId,
      agentId: domainId,
      domainId,
      userId: request.userId,
      action: 'session_start',
      decision: 'allowed',
    });

    // Track active sessions
    runtime.activeSessions += 1;
    runtime.totalRequests += 1;

    try {
      // If an executor is provided, route through the Orchestrator
      if (this.executor) {
        const response = await this.executeViaOrchestrator(
          request,
          runtime,
          domainId,
          operationId,
          startTime,
        );

        if (response.success) {
          this.operationTracker.complete(operationId, response.totalTokens);
        } else {
          this.operationTracker.fail(operationId, response.error ?? 'Unknown error');
        }

        return response;
      }

      // Stub mode: return a response indicating the domain was matched
      const scopedSkills = runtime.skillRegistry.getAll();
      const skillNames = scopedSkills.map((s) => s.name);

      const response: HarnessResponse = {
        requestId: request.requestId,
        operationId,
        success: true,
        content: `Domain "${domainId}" matched. ` +
          `Available skills: [${skillNames.join(', ')}]. ` +
          `Goal: ${request.goal}`,
        tasksExecuted: 1,
        totalTokens: { input: 0, output: 0 },
        totalDurationMs: Date.now() - startTime,
      };

      this.operationTracker.complete(operationId);
      return response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.operationTracker.fail(operationId, message);
      throw error;
    } finally {
      runtime.activeSessions -= 1;
    }
  }

  /** Operation tracker 접근자 — 외부에서 작업 상태 조회용 */
  get operations(): IOperationTracker {
    return this.operationTracker;
  }

  /**
   * Returns the current harness status along with
   * per-domain status information.
   */
  getStatus(): { status: HarnessStatus; domains: DomainStatus[] } {
    const domains: DomainStatus[] = [];

    for (const [domainId, runtime] of this.domainRuntimes) {
      domains.push({
        domainId,
        activeSessions: runtime.activeSessions,
        totalRequests: runtime.totalRequests,
        provider: runtime.config.provider.providerId,
        model: runtime.config.provider.model,
        skills: runtime.config.skills,
      });
    }

    return { status: this.status, domains };
  }

  /**
   * Shuts down the harness, setting status to shutting_down
   * and cleaning up resources.
   */
  async shutdown(): Promise<void> {
    this.status = 'shutting_down';
    this.domainRuntimes.clear();
    this.initialized = false;
    this.status = 'idle';
  }

  /**
   * Loads .skill.md files from the configured skillsDir
   * into the global skill registry.
   */
  private async loadSkills(): Promise<void> {
    try {
      const loader = new SkillLoader(this.config.skillsDir);
      const skills = await loader.loadAll();

      for (const skill of skills) {
        this.globalSkillRegistry.register(skill);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // If skillsDir doesn't exist, log but don't fail initialization
      if (message.includes('ENOENT')) {
        return;
      }
      throw error;
    }
  }

  /**
   * Creates a per-domain runtime with scoped skill and rule registries.
   * Only skills referenced in the domain config are included.
   */
  private createDomainRuntime(config: DomainConfig): void {
    const skillRegistry = new SkillRegistry();
    const ruleRegistry = new RuleRegistry();

    // Scope skills: only register skills that the domain references
    for (const skillName of config.skills) {
      const skill = this.globalSkillRegistry.get(skillName);

      if (skill) {
        skillRegistry.register(skill);
      }
    }

    // Scope rules: only register rules that the domain references
    for (const ruleName of config.rules) {
      const rule = this.globalRuleRegistry.get(ruleName);

      if (rule) {
        ruleRegistry.register(rule);
      }
    }

    this.domainRuntimes.set(config.id, {
      config,
      skillRegistry,
      ruleRegistry,
      totalRequests: 0,
      activeSessions: 0,
    });
  }

  /**
   * Routes a request through the Orchestrator with real sub-agent execution.
   * Creates a SubAgentRegistry from the domain's skills and delegates to Orchestrator.run().
   */
  private async executeViaOrchestrator(
    request: HarnessRequest,
    runtime: DomainRuntime,
    domainId: string,
    operationId: string,
    startTime: number,
  ): Promise<HarnessResponse> {
    const agentRegistry = new SubAgentRegistry();

    // Register each domain skill as a sub-agent descriptor
    const scopedSkills = runtime.skillRegistry.getAll();
    for (const skill of scopedSkills) {
      agentRegistry.register({
        id: `agent_${skill.name}`,
        description: skill.description ?? skill.name,
        skillName: skill.name,
        parameters: [],
      });
    }

    const orchestrator = new Orchestrator({
      agentRegistry,
      executor: this.executor!,
      policy: this.policy,
    });

    const orchestratorResult: OrchestratorResult = await orchestrator.run({
      userId: request.userId,
      domainId,
      goal: request.goal,
    });

    return {
      requestId: request.requestId,
      operationId,
      success: orchestratorResult.success,
      content: orchestratorResult.content,
      tasksExecuted: orchestratorResult.results.length,
      totalTokens: orchestratorResult.totalTokens,
      totalDurationMs: Date.now() - startTime,
      error: orchestratorResult.success ? undefined : orchestratorResult.content,
    };
  }

  /** Ensures initialize() has been called before operations */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Harness is not initialized. Call initialize() first.');
    }
  }

  /** Builds an error HarnessResponse (pre-operation errors have empty operationId) */
  private buildErrorResponse(
    requestId: string,
    errorMessage: string,
    startTime: number,
    operationId: string = '',
  ): HarnessResponse {
    return {
      requestId,
      operationId,
      success: false,
      content: '',
      tasksExecuted: 0,
      totalTokens: { input: 0, output: 0 },
      totalDurationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
