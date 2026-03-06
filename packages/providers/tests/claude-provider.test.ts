import { describe, it, expect, vi } from 'vitest';
import type { ProviderConfig } from '@cli-agent/core';
import { ClaudeProvider } from '../src/claude-provider.js';

const CONFIG: ProviderConfig = {
  providerId: 'claude',
  model: 'claude-opus-4-6',
  auth: { type: 'api-key' as const, apiKey: 'test-key' },
  maxTokens: 4096,
  temperature: 0.7,
};

describe('ClaudeProvider', () => {
  it('should have correct providerId', () => {
    const provider = new ClaudeProvider(CONFIG);
    expect(provider.providerId).toBe('claude');
  });

  it('should implement chat method', () => {
    const provider = new ClaudeProvider(CONFIG);
    expect(typeof provider.chat).toBe('function');
  });

  it('should implement stream method', () => {
    const provider = new ClaudeProvider(CONFIG);
    expect(typeof provider.stream).toBe('function');
  });

  it('should throw ProviderError on chat failure', async () => {
    const provider = new ClaudeProvider({ ...CONFIG, auth: { type: 'api-key' as const, apiKey: 'invalid' } });
    await expect(
      provider.chat([{ role: 'user', content: 'test' }])
    ).rejects.toThrow();
  });
});
