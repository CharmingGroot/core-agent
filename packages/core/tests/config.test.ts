import { describe, it, expect } from 'vitest';
import {
  parseConfig,
  parseAgentConfig,
  providerConfigSchema,
  agentConfigSchema,
} from '../src/config.js';
import { ConfigError } from '../src/errors/base-error.js';

const VALID_PROVIDER = {
  providerId: 'claude',
  model: 'claude-opus-4-6',
  apiKey: 'sk-test-key-123',
};

describe('Config', () => {
  describe('providerConfigSchema', () => {
    it('should validate a valid provider config', () => {
      const result = providerConfigSchema.safeParse(VALID_PROVIDER);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxTokens).toBe(4096);
        expect(result.data.temperature).toBe(0.7);
      }
    });

    it('should reject empty providerId', () => {
      const result = providerConfigSchema.safeParse({
        ...VALID_PROVIDER,
        providerId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid baseUrl', () => {
      const result = providerConfigSchema.safeParse({
        ...VALID_PROVIDER,
        baseUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept custom maxTokens and temperature', () => {
      const result = providerConfigSchema.safeParse({
        ...VALID_PROVIDER,
        maxTokens: 8192,
        temperature: 1.0,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxTokens).toBe(8192);
        expect(result.data.temperature).toBe(1.0);
      }
    });
  });

  describe('parseConfig', () => {
    it('should parse valid config', () => {
      const config = parseConfig(providerConfigSchema, VALID_PROVIDER);
      expect(config.providerId).toBe('claude');
    });

    it('should throw ConfigError on invalid config', () => {
      expect(() => parseConfig(providerConfigSchema, {})).toThrow(ConfigError);
    });

    it('should include field paths in error message', () => {
      try {
        parseConfig(providerConfigSchema, {});
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        expect((e as ConfigError).message).toContain('providerId');
      }
    });
  });

  describe('parseAgentConfig', () => {
    it('should parse a valid agent config', () => {
      const config = parseAgentConfig({
        provider: VALID_PROVIDER,
      });
      expect(config.provider.providerId).toBe('claude');
      expect(config.maxIterations).toBe(50);
    });

    it('should apply defaults', () => {
      const config = parseAgentConfig({
        provider: VALID_PROVIDER,
      });
      expect(config.maxIterations).toBe(50);
      expect(config.workingDirectory).toBeTruthy();
    });

    it('should throw on missing provider', () => {
      expect(() => parseAgentConfig({})).toThrow(ConfigError);
    });
  });
});
