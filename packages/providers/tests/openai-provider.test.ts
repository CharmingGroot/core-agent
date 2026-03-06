import { describe, it, expect } from 'vitest';
import type { ProviderConfig } from '@cli-agent/core';
import { OpenAIProvider } from '../src/openai-provider.js';

const CONFIG: ProviderConfig = {
  providerId: 'openai',
  model: 'gpt-4',
  apiKey: 'test-key',
  maxTokens: 4096,
  temperature: 0.7,
};

describe('OpenAIProvider', () => {
  it('should have correct providerId', () => {
    const provider = new OpenAIProvider(CONFIG);
    expect(provider.providerId).toBe('openai');
  });

  it('should implement chat method', () => {
    const provider = new OpenAIProvider(CONFIG);
    expect(typeof provider.chat).toBe('function');
  });

  it('should implement stream method', () => {
    const provider = new OpenAIProvider(CONFIG);
    expect(typeof provider.stream).toBe('function');
  });

  it('should throw ProviderError on chat failure', async () => {
    const provider = new OpenAIProvider({ ...CONFIG, apiKey: 'invalid' });
    await expect(
      provider.chat([{ role: 'user', content: 'test' }])
    ).rejects.toThrow();
  });
});
