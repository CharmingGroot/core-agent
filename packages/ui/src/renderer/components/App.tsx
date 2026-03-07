import React, { useState, useCallback, useEffect } from 'react';
import type { AppConfig, AppView } from '../types.js';
import { ChatPanel } from './ChatPanel.js';
import { SettingsPanel } from './SettingsPanel.js';
import { GovernancePanel } from './governance/GovernancePanel.js';
import { useAgent } from '../hooks/useAgent.js';

const DEFAULT_CONFIG: AppConfig = {
  providerId: 'claude',
  model: 'claude-sonnet-4-6',
  apiKey: '',
  maxTokens: 4096,
  temperature: 0.7,
  workingDirectory: '.',
};

export function App(): React.ReactElement {
  const [sidePanel, setSidePanel] = useState<AppView | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const hasConfig = config.apiKey.length > 0;

  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onConfigValue((persisted) => {
      setConfig({
        providerId: persisted.providerId,
        model: persisted.model,
        apiKey: persisted.apiKey,
        baseUrl: persisted.baseUrl,
        maxTokens: persisted.maxTokens,
        temperature: persisted.temperature,
        systemPrompt: persisted.systemPrompt,
        workingDirectory: persisted.workingDirectory,
      });
    });
    window.electronApi.getConfig();
    return unsub;
  }, []);

  const { messages, isLoading, sendMessage, abort, clearMessages } = useAgent(
    hasConfig ? config : null
  );

  const handleNewChat = useCallback(() => {
    clearMessages();
    setSidePanel(null);
  }, [clearMessages]);

  const handleSaveConfig = useCallback((newConfig: AppConfig) => {
    setConfig(newConfig);
    setSidePanel(null);
  }, []);

  const togglePanel = useCallback((panel: AppView) => {
    setSidePanel((prev) => (prev === panel ? null : panel));
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <span className="header-logo">{'>'}_</span>
          <span className="header-title">Chamelion</span>
        </div>
        <div className="header-right">
          {hasConfig && (
            <span className="provider-badge">
              {config.providerId} / {config.model}
            </span>
          )}
          <button className="btn" onClick={handleNewChat}>
            New Chat
          </button>
          <button
            className={`btn ${sidePanel === 'governance' ? 'btn-active' : ''}`}
            onClick={() => togglePanel('governance')}
          >
            Governance
          </button>
          <button
            className={`btn ${sidePanel === 'settings' ? 'btn-active' : ''}`}
            onClick={() => togglePanel('settings')}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        <div className="chat-area">
          {!hasConfig ? (
            <div className="welcome">
              <div className="welcome-icon">{'>'}_</div>
              <div className="welcome-title">Welcome to Chamelion</div>
              <div className="welcome-text">Configure your API key to get started</div>
              <button className="btn btn-primary" onClick={() => setSidePanel('settings')}>
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

        {/* Side Panel */}
        {sidePanel === 'settings' && (
          <div className="side-panel">
            <SettingsPanel
              config={config}
              onSave={handleSaveConfig}
              onBack={() => setSidePanel(null)}
            />
          </div>
        )}
        {sidePanel === 'governance' && (
          <div className="side-panel">
            <GovernancePanel onBack={() => setSidePanel(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
