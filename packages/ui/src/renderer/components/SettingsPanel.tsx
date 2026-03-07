import React, { useState, useCallback, useEffect } from 'react';
import type { AppConfig } from '../types.js';

const PROVIDERS = [
  { id: 'claude', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'OpenAI' },
];

interface SettingsPanelProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  onBack: () => void;
}

export function SettingsPanel({ config, onSave, onBack }: SettingsPanelProps): React.ReactElement {
  const [draft, setDraft] = useState<AppConfig>({ ...config });

  const update = useCallback(<K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [draft, onSave]);

  const handleSelectDirectory = useCallback(() => {
    if (!window.electronApi) return;
    window.electronApi.selectDirectory();
  }, []);

  useEffect(() => {
    if (!window.electronApi) return;
    const unsub = window.electronApi.onDirectorySelected((path: string) => {
      setDraft((prev) => ({ ...prev, workingDirectory: path }));
    });
    return unsub;
  }, []);

  return (
    <>
      <div className="side-panel-header">
        <span className="side-panel-title">Settings</span>
        <button className="btn btn-icon" onClick={onBack}>{'\u2715'}</button>
      </div>
      <div className="side-panel-body">
        <div className="form">
          <div className="field">
            <label className="field-label">Provider</label>
            <select
              className="field-select"
              value={draft.providerId}
              onChange={(e) => update('providerId', e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label">Model</label>
            <input
              className="field-input"
              type="text"
              value={draft.model}
              onChange={(e) => update('model', e.target.value)}
              placeholder="e.g. claude-sonnet-4-6"
            />
          </div>

          <div className="field">
            <label className="field-label">API Key</label>
            <input
              className="field-input"
              type="password"
              value={draft.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div className="field">
            <label className="field-label">Base URL (optional)</label>
            <input
              className="field-input"
              type="text"
              value={draft.baseUrl ?? ''}
              onChange={(e) => update('baseUrl', e.target.value || undefined)}
              placeholder="https://api.example.com"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label">Max Tokens</label>
              <input
                className="field-input"
                type="number"
                value={draft.maxTokens}
                onChange={(e) => update('maxTokens', parseInt(e.target.value, 10) || 4096)}
              />
            </div>
            <div className="field">
              <label className="field-label">Temperature</label>
              <input
                className="field-input"
                type="number"
                value={draft.temperature}
                onChange={(e) => update('temperature', parseFloat(e.target.value) || 0.7)}
                step="0.1"
                min="0"
                max="2"
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label">System Prompt (optional)</label>
            <textarea
              className="field-input field-textarea"
              value={draft.systemPrompt ?? ''}
              onChange={(e) => update('systemPrompt', e.target.value || undefined)}
              placeholder="You are a helpful assistant..."
              rows={3}
            />
          </div>

          <div className="field">
            <label className="field-label">Working Directory</label>
            <div className="field-row">
              <input
                className="field-input"
                type="text"
                value={draft.workingDirectory}
                onChange={(e) => update('workingDirectory', e.target.value)}
              />
              <button className="btn" onClick={handleSelectDirectory}>Browse</button>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave} style={{ marginTop: 8 }}>
            Save Settings
          </button>
        </div>
      </div>
    </>
  );
}
