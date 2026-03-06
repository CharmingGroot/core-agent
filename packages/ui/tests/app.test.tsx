import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { App } from '../src/renderer/components/App.js';

// Mock window.electronApi
beforeEach(() => {
  (globalThis as Record<string, unknown>)['window'] = {
    electronApi: {
      sendMessage: vi.fn(),
      abort: vi.fn(),
      getConfig: vi.fn(),
      setConfig: vi.fn(),
      onAgentEvent: vi.fn(() => vi.fn()),
      onAgentResponse: vi.fn(() => vi.fn()),
      onAgentError: vi.fn(() => vi.fn()),
      onConfigValue: vi.fn(() => vi.fn()),
    },
  };
});

describe('App', () => {
  it('should render the app shell', () => {
    const html = renderToString(<App />);
    expect(html).toContain('CLI Agent');
  });

  it('should show welcome screen when no API key', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Welcome to CLI Agent');
    expect(html).toContain('Open Settings');
  });

  it('should render settings button', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Settings');
  });

  it('should render clear button', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Clear');
  });

  it('should render logo', () => {
    const html = renderToString(<App />);
    // React SSR renders {'>'} and {'_'} with comment node between
    expect(html).toContain('&gt;');
    expect(html).toContain('_');
  });
});
