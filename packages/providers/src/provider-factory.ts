import type { ILlmProvider, ProviderConfig } from '@cli-agent/core';
import { Registry, ProviderError } from '@cli-agent/core';
import { ClaudeProvider } from './claude-provider.js';
import { OpenAIProvider } from './openai-provider.js';

type ProviderConstructor = new (config: ProviderConfig) => ILlmProvider;

const providerRegistry = new Registry<ProviderConstructor>('Provider');

providerRegistry.register('claude', ClaudeProvider);
providerRegistry.register('openai', OpenAIProvider);
providerRegistry.register('vllm', OpenAIProvider);
providerRegistry.register('ollama', OpenAIProvider);
providerRegistry.register('custom', OpenAIProvider);

export function createProvider(config: ProviderConfig): ILlmProvider {
  const Constructor = providerRegistry.tryGet(config.providerId);
  if (!Constructor) {
    throw new ProviderError(
      `Unknown provider: '${config.providerId}'. Available: ${providerRegistry.getAllNames().join(', ')}`
    );
  }
  return new Constructor(config);
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
