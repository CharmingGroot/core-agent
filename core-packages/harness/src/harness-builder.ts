/**
 * HarnessBuilder — Fluent builder for constructing Harness instances.
 *
 * Provides a convenient API for assembling a Harness with
 * domains, skills directory, rules directory, and policy provider.
 *
 * Defaults:
 *   - policy: OpenPolicy (standalone, permit-all)
 *   - skillsDir: './skills'
 *   - rulesDir: './rules'
 */
import type { IPolicyProvider, DomainConfig, IOperationTracker } from '@core/types';
import { OpenPolicy } from '@core/types';
import type { ISubAgentExecutor } from '@core/orchestrator';
import { Harness } from './harness.js';

const DEFAULT_SKILLS_DIR = './skills';
const DEFAULT_RULES_DIR = './rules';

export class HarnessBuilder {
  private domains: DomainConfig[] = [];
  private skillsDir: string = DEFAULT_SKILLS_DIR;
  private rulesDir: string = DEFAULT_RULES_DIR;
  private policy: IPolicyProvider = new OpenPolicy();
  private defaultDomainId: string | undefined;
  private executor: ISubAgentExecutor | undefined;
  private tracker: IOperationTracker | undefined;

  /**
   * Adds a domain configuration to the harness.
   * Can be called multiple times to register multiple domains.
   */
  withDomain(config: DomainConfig): this {
    this.domains.push(config);
    return this;
  }

  /**
   * Sets the directory from which .skill.md files are loaded.
   * @default './skills'
   */
  withSkillsDir(dir: string): this {
    this.skillsDir = dir;
    return this;
  }

  /**
   * Sets the directory from which rule definitions are loaded.
   * @default './rules'
   */
  withRulesDir(dir: string): this {
    this.rulesDir = dir;
    return this;
  }

  /**
   * Sets the policy provider for governance.
   * @default OpenPolicy (standalone, permit-all)
   */
  withPolicy(policy: IPolicyProvider): this {
    this.policy = policy;
    return this;
  }

  /**
   * Sets the default domain id used when a request
   * does not specify a domain explicitly.
   */
  withDefaultDomain(id: string): this {
    this.defaultDomainId = id;
    return this;
  }

  /**
   * Sets the sub-agent executor for real orchestration.
   * If not provided, the harness runs in stub mode
   * (returns domain match info without executing agents).
   */
  withExecutor(executor: ISubAgentExecutor): this {
    this.executor = executor;
    return this;
  }

  /**
   * Sets the operation tracker for centralized status management.
   * If not provided, InMemoryOperationTracker is used by default.
   */
  withOperationTracker(tracker: IOperationTracker): this {
    this.tracker = tracker;
    return this;
  }

  /**
   * Builds and returns a new Harness instance.
   * The caller must still call harness.initialize() before use.
   */
  build(): Harness {
    return new Harness(
      {
        domains: this.domains,
        defaultDomainId: this.defaultDomainId,
        skillsDir: this.skillsDir,
        rulesDir: this.rulesDir,
      },
      this.policy,
      this.executor,
      this.tracker,
    );
  }
}
