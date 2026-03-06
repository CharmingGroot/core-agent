import React, { useState, useCallback } from 'react';
import type { DomainEntry } from '../../types.js';

interface DomainPanelProps {
  domains: readonly DomainEntry[];
  onAdd: (domain: Omit<DomainEntry, 'id'>) => void;
  onRemove: (id: string) => void;
}

export function DomainPanel({ domains, onAdd, onRemove }: DomainPanelProps): React.ReactElement {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [agentsInput, setAgentsInput] = useState('');

  const handleAdd = useCallback(() => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      description: description.trim(),
      skills: skillsInput.split(',').map((s) => s.trim()).filter(Boolean),
      agents: agentsInput.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setName('');
    setDescription('');
    setSkillsInput('');
    setAgentsInput('');
    setShowForm(false);
  }, [name, description, skillsInput, agentsInput, onAdd]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.sectionTitle}>Domain Configuration</h3>
        <button onClick={() => setShowForm(!showForm)} style={styles.addButton}>
          {showForm ? 'Cancel' : '+ Add Domain'}
        </button>
      </div>

      {showForm && (
        <div style={styles.form}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Domain name"
            style={styles.input}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            style={styles.input}
          />
          <input
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            placeholder="Skills (comma-separated)"
            style={styles.input}
          />
          <input
            value={agentsInput}
            onChange={(e) => setAgentsInput(e.target.value)}
            placeholder="Agents (comma-separated)"
            style={styles.input}
          />
          <button onClick={handleAdd} style={styles.submitButton}>
            Create Domain
          </button>
        </div>
      )}

      {domains.length === 0 ? (
        <div style={styles.empty}>No domains configured. Add one to get started.</div>
      ) : (
        <div style={styles.list}>
          {domains.map((domain) => (
            <div key={domain.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.cardName}>{domain.name}</span>
                <button onClick={() => onRemove(domain.id)} style={styles.removeButton}>
                  Remove
                </button>
              </div>
              <div style={styles.cardDesc}>{domain.description}</div>
              <div style={styles.tagRow}>
                <span style={styles.tagLabel}>Skills:</span>
                {domain.skills.map((s) => (
                  <span key={s} style={styles.tag}>{s}</span>
                ))}
              </div>
              <div style={styles.tagRow}>
                <span style={styles.tagLabel}>Agents:</span>
                {domain.agents.map((a) => (
                  <span key={a} style={{ ...styles.tag, backgroundColor: '#1e3a5f' }}>{a}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  addButton: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#60a5fa',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    fontSize: '14px',
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    outline: 'none',
  },
  submitButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '13px',
    alignSelf: 'flex-start',
  },
  empty: {
    color: '#64748b',
    fontSize: '14px',
    padding: '24px',
    textAlign: 'center',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    padding: '12px',
    backgroundColor: '#1e293b',
    borderRadius: '8px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  removeButton: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '4px',
    color: '#ef4444',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '11px',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  tagRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  tagLabel: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  tag: {
    fontSize: '11px',
    color: '#e2e8f0',
    backgroundColor: '#1e3a2f',
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
};
