import { describe, it, expect, beforeEach } from 'vitest';
import type { DomainConfig } from '@core/types';
import { DomainManager } from '../src/domain-manager.js';

/** Creates a valid domain config for testing */
function createDomainConfig(overrides: Partial<DomainConfig> = {}): DomainConfig {
  return {
    id: 'test-domain',
    name: 'Test Domain',
    skills: ['code-review'],
    rules: ['no-rm-rf'],
    provider: {
      providerId: 'openai',
      model: 'gpt-4',
      auth: { type: 'api-key', key: 'test-key' },
    },
    ...overrides,
  };
}

describe('DomainManager', () => {
  let manager: DomainManager;

  beforeEach(() => {
    manager = new DomainManager();
  });

  it('should register and retrieve a valid domain', () => {
    const config = createDomainConfig();
    manager.registerDomain(config);

    const result = manager.getDomain('test-domain');
    expect(result).toEqual(config);
  });

  it('should return undefined for a non-existent domain', () => {
    expect(manager.getDomain('nonexistent')).toBeUndefined();
  });

  it('should list all registered domains', () => {
    const domainA = createDomainConfig({ id: 'domain-a', name: 'Domain A' });
    const domainB = createDomainConfig({ id: 'domain-b', name: 'Domain B' });

    manager.registerDomain(domainA);
    manager.registerDomain(domainB);

    const domains = manager.listDomains();
    expect(domains).toHaveLength(2);

    const ids = domains.map((d) => d.id).sort();
    expect(ids).toEqual(['domain-a', 'domain-b']);
  });

  it('should remove a domain and return true', () => {
    manager.registerDomain(createDomainConfig());

    const removed = manager.removeDomain('test-domain');
    expect(removed).toBe(true);
    expect(manager.getDomain('test-domain')).toBeUndefined();
  });

  it('should return false when removing a non-existent domain', () => {
    expect(manager.removeDomain('nonexistent')).toBe(false);
  });

  it('should overwrite an existing domain with the same id', () => {
    const original = createDomainConfig({ name: 'Original' });
    const updated = createDomainConfig({ name: 'Updated' });

    manager.registerDomain(original);
    manager.registerDomain(updated);

    const result = manager.getDomain('test-domain');
    expect(result?.name).toBe('Updated');
    expect(manager.listDomains()).toHaveLength(1);
  });

  describe('validateDomain', () => {
    it('should return empty array for a valid config', () => {
      const config = createDomainConfig();
      const errors = manager.validateDomain(config);
      expect(errors).toEqual([]);
    });

    it('should report error when id is missing', () => {
      const config = createDomainConfig({ id: '' });
      const errors = manager.validateDomain(config);
      expect(errors).toContain('id is required');
    });

    it('should report error when name is missing', () => {
      const config = createDomainConfig({ name: '' });
      const errors = manager.validateDomain(config);
      expect(errors).toContain('name is required');
    });

    it('should report error when skills array is empty', () => {
      const config = createDomainConfig({ skills: [] });
      const errors = manager.validateDomain(config);
      expect(errors).toContain('skills must be a non-empty array');
    });

    it('should report error when provider fields are missing', () => {
      const config = createDomainConfig({
        provider: {
          providerId: '',
          model: '',
          auth: { type: '' },
        },
      });
      const errors = manager.validateDomain(config);
      expect(errors).toContain('provider.providerId is required');
      expect(errors).toContain('provider.model is required');
    });

    it('should throw when registering an invalid domain', () => {
      const config = createDomainConfig({ id: '', name: '' });
      expect(() => manager.registerDomain(config)).toThrow('Invalid domain config');
    });
  });
});
