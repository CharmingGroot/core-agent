import React, { useState, useCallback } from 'react';
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
    onBack();
  }, [draft, onSave, onBack]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          {'<'} Back
        </button>
        <h2 style={styles.title}>Settings</h2>
      </div>

      <div style={styles.form}>
        <FieldGroup label="Provider">
          <select
            value={draft.providerId}
            onChange={(e) => update('providerId', e.target.value)}
            style={styles.select}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </FieldGroup>

        <FieldGroup label="Model">
          <input
            type="text"
            value={draft.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="e.g. claude-sonnet-4-6"
            style={styles.input}
          />
        </FieldGroup>

        <FieldGroup label="API Key">
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => update('apiKey', e.target.value)}
            placeholder="sk-..."
            style={styles.input}
          />
        </FieldGroup>

        <FieldGroup label="Base URL (optional)">
          <input
            type="text"
            value={draft.baseUrl ?? ''}
            onChange={(e) => update('baseUrl', e.target.value || undefined)}
            placeholder="https://api.example.com"
            style={styles.input}
          />
        </FieldGroup>

        <div style={styles.row}>
          <FieldGroup label="Max Tokens">
            <input
              type="number"
              value={draft.maxTokens}
              onChange={(e) => update('maxTokens', parseInt(e.target.value, 10) || 4096)}
              style={styles.input}
            />
          </FieldGroup>
          <FieldGroup label="Temperature">
            <input
              type="number"
              value={draft.temperature}
              onChange={(e) => update('temperature', parseFloat(e.target.value) || 0.7)}
              step="0.1"
              min="0"
              max="2"
              style={styles.input}
            />
          </FieldGroup>
        </div>

        <FieldGroup label="System Prompt (optional)">
          <textarea
            value={draft.systemPrompt ?? ''}
            onChange={(e) => update('systemPrompt', e.target.value || undefined)}
            placeholder="You are a helpful assistant..."
            rows={3}
            style={{ ...styles.input, resize: 'vertical' as const }}
          />
        </FieldGroup>

        <FieldGroup label="Working Directory">
          <input
            type="text"
            value={draft.workingDirectory}
            onChange={(e) => update('workingDirectory', e.target.value)}
            style={styles.input}
          />
        </FieldGroup>

        <button onClick={handleSave} style={styles.saveButton}>
          Save Settings
        </button>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={styles.fieldGroup}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderBottom: '1px solid #1e293b',
  },
  backButton: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
  },
  form: {
    padding: '16px',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    fontSize: '14px',
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    fontSize: '14px',
    outline: 'none',
  },
  row: {
    display: 'flex',
    gap: '12px',
  },
  saveButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '14px',
    marginTop: '8px',
  },
};
