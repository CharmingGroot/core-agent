import React, { useState, useCallback } from 'react';
import type { AppConfig, AppView } from '../types.js';
import { ChatPanel } from './ChatPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { useAgent } from '../hooks/useAgent.js';

const DEFAULT_CONFIG: AppConfig = {
  providerId: 'claude',
  model: 'claude-sonnet-4-6',
  apiKey: '',
  maxTokens: 4096,
  temperature: 0.7,
  workingDirectory: process.cwd?.() ?? '.',
};

export function App(): React.ReactElement {
  const [view, setView] = useState<AppView>('chat');
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const hasConfig = config.apiKey.length > 0;

  const { messages, isLoading, sendMessage, abort, clearMessages } = useAgent(
    hasConfig ? config : null
  );

  const handleSaveConfig = useCallback((newConfig: AppConfig) => {
    setConfig(newConfig);
  }, []);

  return (
    <div style={styles.app}>
      <div style={styles.titleBar}>
        <div style={styles.titleLeft}>
          <span style={styles.logo}>{'>'}_</span>
          <span style={styles.titleText}>CLI Agent</span>
        </div>
        <div style={styles.titleRight}>
          {hasConfig && (
            <span style={styles.providerBadge}>
              {config.providerId} / {config.model}
            </span>
          )}
          <button
            onClick={clearMessages}
            style={styles.titleButton}
            title="Clear chat"
          >
            Clear
          </button>
          <button
            onClick={() => setView(view === 'chat' ? 'settings' : 'chat')}
            style={styles.titleButton}
          >
            {view === 'chat' ? 'Settings' : 'Chat'}
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {view === 'settings' ? (
          <SettingsPanel
            config={config}
            onSave={handleSaveConfig}
            onBack={() => setView('chat')}
          />
        ) : !hasConfig ? (
          <div style={styles.noConfig}>
            <div style={styles.noConfigIcon}>{'>'}_</div>
            <div style={styles.noConfigTitle}>Welcome to CLI Agent</div>
            <div style={styles.noConfigText}>
              Configure your API key to get started
            </div>
            <button
              onClick={() => setView('settings')}
              style={styles.configButton}
            >
              Open Settings
            </button>
          </div>
        ) : (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSendMessage={sendMessage}
            onAbort={abort}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0f172a',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    backgroundColor: '#020617',
    borderBottom: '1px solid #1e293b',
    WebkitAppRegion: 'drag' as unknown as string,
    userSelect: 'none',
  },
  titleLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logo: {
    fontFamily: 'monospace',
    fontSize: '18px',
    color: '#60a5fa',
    fontWeight: 700,
  },
  titleText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  titleRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    WebkitAppRegion: 'no-drag' as unknown as string,
  },
  providerBadge: {
    fontSize: '11px',
    color: '#94a3b8',
    backgroundColor: '#1e293b',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  titleButton: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '4px',
    color: '#94a3b8',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  noConfig: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '12px',
    color: '#64748b',
  },
  noConfigIcon: {
    fontSize: '64px',
    fontFamily: 'monospace',
    color: '#1e293b',
  },
  noConfigTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  noConfigText: {
    fontSize: '14px',
  },
  configButton: {
    marginTop: '8px',
    padding: '10px 24px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '14px',
  },
};
