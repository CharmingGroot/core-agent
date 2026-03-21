import { describe, it, expect } from 'vitest';
import type { ProviderConfig, ILlmProvider, Message, LlmResponse, StreamEvent, ToolDescription } from '@cli-agent/core';
import { ProviderError } from '@cli-agent/core';
import { createProvider, registerProvider, getProviderRegistry } from '../src/provider-factory.js';
import { CircuitBreakerProvider } from '../src/circuit-breaker.js';

const CLAUDE_CONFIG: ProviderConfig = {
  providerId: 'claude',
  model: 'claude-opus-4-6',
  auth: { type: 'api-key' as const, apiKey: 'test-key' },
  maxTokens: 4096,
  temperature: 0.7,
};

const OPENAI_CONFIG: ProviderConfig = {
  providerId: 'openai',
  model: 'gpt-4',
  auth: { type: 'api-key' as const, apiKey: 'test-key' },
  maxTokens: 4096,
  temperature: 0.7,
};

describe('ProviderFactory', () => {
  it('should create a Claude provider', () => {
    const provider = createProvider(CLAUDE_CONFIG);
    expect(provider).toBeInstanceOf(CircuitBreakerProvider);
    expect(provider.providerId).toBe('claude');
  });

  it('should create an OpenAI provider', () => {
    const provider = createProvider(OPENAI_CONFIG);
    expect(provider).toBeInstanceOf(CircuitBreakerProvider);
    expect(provider.providerId).toBe('openai');
  });

  it('should throw for unknown provider', () => {
    expect(() =>
      createProvider({ ...CLAUDE_CONFIG, providerId: 'unknown' })
    ).toThrow(ProviderError);
  });

  it('should include available providers in error message', () => {
    try {
      createProvider({ ...CLAUDE_CONFIG, providerId: 'unknown' });
    } catch (e) {
      expect((e as ProviderError).message).toContain('claude');
      expect((e as ProviderError).message).toContain('openai');
    }
  });

  it('should allow registering custom providers', () => {
    class CustomProvider implements ILlmProvider {
      readonly providerId = 'custom';
      async chat(_messages: readonly Message[], _tools?: readonly ToolDescription[]): Promise<LlmResponse> {
        return { content: '', stopReason: 'end_turn', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } };
      }
      async *stream(_messages: readonly Message[], _tools?: readonly ToolDescription[]): AsyncIterable<StreamEvent> {
        yield { type: 'done', response: { content: '', stopReason: 'end_turn', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } } };
      }
    }
    registerProvider('test-custom', CustomProvider);
    const provider = createProvider({ ...CLAUDE_CONFIG, providerId: 'test-custom' });
    expect(provider.providerId).toBe('custom');
    // cleanup
    getProviderRegistry().unregister('test-custom');
  });

  it('should expose the provider registry', () => {
    const registry = getProviderRegistry();
    expect(registry.has('claude')).toBe(true);
    expect(registry.has('openai')).toBe(true);
  });
});
