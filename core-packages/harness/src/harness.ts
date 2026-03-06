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
} from '@core/types';
import { SkillLoader, SkillRegistry } from '@core/skill';
import { RuleRegistry } from '@core/rule';
import { DomainManager } from './domain-manager.js';

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
  private status: HarnessStatus = 'idle';
  private initialized = false;

  constructor(config: HarnessConfig, policy: IPolicyProvider) {
    this.config = config;
    this.policy = policy;
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
      // Simplified orchestrator integration:
      // Return a response indicating the domain was matched and skills are available
      const scopedSkills = runtime.skillRegistry.getAll();
      const skillNames = scopedSkills.map((s) => s.name);

      const response: HarnessResponse = {
        requestId: request.requestId,
        success: true,
        content: `Domain "${domainId}" matched. ` +
          `Available skills: [${skillNames.join(', ')}]. ` +
          `Goal: ${request.goal}`,
        tasksExecuted: 1,
        totalTokens: { input: 0, output: 0 },
        totalDurationMs: Date.now() - startTime,
      };

      return response;
    } finally {
      runtime.activeSessions -= 1;
    }
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

  /** Ensures initialize() has been called before operations */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Harness is not initialized. Call initialize() first.');
    }
  }

  /** Builds an error HarnessResponse */
  private buildErrorResponse(
    requestId: string,
    errorMessage: string,
    startTime: number,
  ): HarnessResponse {
    return {
      requestId,
      success: false,
      content: '',
      tasksExecuted: 0,
      totalTokens: { input: 0, output: 0 },
      totalDurationMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}
