import type { ILlmProvider, ProviderConfig } from '@cli-agent/core';
import { Registry, ProviderError } from '@cli-agent/core';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { RetryProvider } from './retry-provider.js';
import { CircuitBreakerProvider } from './circuit-breaker.js';

type ProviderConstructor = new (config: ProviderConfig) => ILlmProvider;

const providerRegistry = new Registry<ProviderConstructor>('Provider');

providerRegistry.register('claude', ClaudeProvider);
providerRegistry.register('openai', OpenAIProvider);
providerRegistry.register('vllm', OpenAIProvider);
providerRegistry.register('ollama', OpenAIProvider);
providerRegistry.register('custom', OpenAIProvider);

/**
 * Creates a provider wrapped with RetryProvider → CircuitBreakerProvider.
 *
 * Request flow:
 *   AgentLoop → CircuitBreakerProvider → RetryProvider → actual provider
 *
 * CircuitBreaker is outermost so it sees already-retried failures,
 * preventing the circuit from tripping on transient single errors.
 */
export function createProvider(config: ProviderConfig): ILlmProvider {
  const Constructor = providerRegistry.tryGet(config.providerId);
  if (!Constructor) {
    throw new ProviderError(
      `Unknown provider: '${config.providerId}'. Available: ${providerRegistry.getAllNames().join(', ')}`
    );
  }
  const provider = new Constructor(config);
  const withRetry = new RetryProvider(provider);
  return new CircuitBreakerProvider(withRetry);
}

export function registerProvider(
  id: string,
  constructor: ProviderConstructor
): void {
  providerRegistry.register(id, constructor);
}

export function getProviderRegistry(): Registry<ProviderConstructor> {
  return providerRegistry;
}
