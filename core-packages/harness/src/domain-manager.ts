/**
 * DomainManager — Domain lifecycle management.
 *
 * Manages registration, retrieval, and validation of DomainConfig instances.
 * Each domain represents a scoped execution environment with its own
 * skills, rules, and provider configuration.
 */
import type { DomainConfig } from '@core/types';

/** Minimum required fields for provider configuration */
const REQUIRED_PROVIDER_FIELDS: readonly string[] = ['providerId', 'model', 'auth'];

/**
 * Validates and manages domain configurations.
 * Domains are stored in-memory, keyed by their unique id.
 */
export class DomainManager {
  private readonly domains: Map<string, DomainConfig> = new Map();

  /**
   * Registers a domain after validation.
   * Overwrites any existing domain with the same id.
   *
   * @throws {Error} if the domain config has validation errors
   */
  registerDomain(config: DomainConfig): void {
    const errors = this.validateDomain(config);

    if (errors.length > 0) {
      throw new Error(
        `Invalid domain config "${config.id || '(no id)'}": ${errors.join('; ')}`,
      );
    }

    this.domains.set(config.id, config);
  }

  /**
   * Retrieves a domain config by id.
   * Returns undefined if not found.
   */
  getDomain(id: string): DomainConfig | undefined {
    return this.domains.get(id);
  }

  /**
   * Returns all registered domain configs as an array.
   */
  listDomains(): DomainConfig[] {
    return Array.from(this.domains.values());
  }

  /**
   * Removes a domain by id.
   * @returns true if the domain was found and removed, false otherwise
   */
  removeDomain(id: string): boolean {
    return this.domains.delete(id);
  }

  /**
   * Validates a domain config and returns an array of error messages.
   * An empty array means the config is valid.
   *
   * Checks:
   * - id is required and non-empty
   * - name is required and non-empty
   * - skills must be a non-empty array
   * - provider must have required fields (providerId, model, auth)
   */
  validateDomain(config: DomainConfig): string[] {
    const errors: string[] = [];

    if (!config.id || config.id.trim().length === 0) {
      errors.push('id is required');
    }

    if (!config.name || config.name.trim().length === 0) {
      errors.push('name is required');
    }

    if (!config.skills || config.skills.length === 0) {
      errors.push('skills must be a non-empty array');
    }

    if (!config.provider) {
      errors.push('provider is required');
    } else {
      for (const field of REQUIRED_PROVIDER_FIELDS) {
        const value = config.provider[field as keyof typeof config.provider];
        if (value === undefined || value === null || value === '') {
          errors.push(`provider.${field} is required`);
        }
      }
    }

    return errors;
  }
}
