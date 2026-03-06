import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SettingsPanel } from '../src/renderer/components/SettingsPanel.js';
import type { AppConfig } from '../src/renderer/types.js';

const DEFAULT_CONFIG: AppConfig = {
  providerId: 'claude',
  model: 'claude-sonnet-4-6',
  apiKey: 'test-key',
  maxTokens: 4096,
  temperature: 0.7,
  workingDirectory: '/tmp',
};

describe('SettingsPanel', () => {
  it('should render the settings form', () => {
    const html = renderToString(
      <SettingsPanel config={DEFAULT_CONFIG} onSave={vi.fn()} onBack={vi.fn()} />
    );
    expect(html).toContain('Settings');
    expect(html).toContain('Provider');
    expect(html).toContain('Model');
    expect(html).toContain('API Key');
    expect(html).toContain('Save Settings');
  });

  it('should render provider options', () => {
    const html = renderToString(
      <SettingsPanel config={DEFAULT_CONFIG} onSave={vi.fn()} onBack={vi.fn()} />
    );
    expect(html).toContain('Claude (Anthropic)');
    expect(html).toContain('OpenAI');
  });

  it('should render back button', () => {
    const html = renderToString(
      <SettingsPanel config={DEFAULT_CONFIG} onSave={vi.fn()} onBack={vi.fn()} />
    );
    expect(html).toContain('Back');
  });

  it('should render all configuration fields', () => {
    const html = renderToString(
      <SettingsPanel config={DEFAULT_CONFIG} onSave={vi.fn()} onBack={vi.fn()} />
    );
    expect(html).toContain('Max Tokens');
    expect(html).toContain('Temperature');
    expect(html).toContain('System Prompt');
    expect(html).toContain('Working Directory');
    expect(html).toContain('Base URL');
  });

  it('should pre-fill config values', () => {
    const html = renderToString(
      <SettingsPanel config={DEFAULT_CONFIG} onSave={vi.fn()} onBack={vi.fn()} />
    );
    expect(html).toContain('claude-sonnet-4-6');
    expect(html).toContain('4096');
  });

  it('should render with OpenAI config', () => {
    const openaiConfig: AppConfig = {
      ...DEFAULT_CONFIG,
      providerId: 'openai',
      model: 'gpt-4o',
    };
    const html = renderToString(
      <SettingsPanel config={openaiConfig} onSave={vi.fn()} onBack={vi.fn()} />
    );
    expect(html).toContain('gpt-4o');
  });
});
