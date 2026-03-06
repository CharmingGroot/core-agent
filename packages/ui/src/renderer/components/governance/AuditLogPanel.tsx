import React from 'react';
import type { AuditLogEntry } from '../../types.js';

interface AuditLogPanelProps {
  entries: readonly AuditLogEntry[];
  onClear: () => void;
}

const MAX_VISIBLE_ENTRIES = 200;

export function AuditLogPanel({ entries, onClear }: AuditLogPanelProps): React.ReactElement {
  const visible = entries.slice(-MAX_VISIBLE_ENTRIES);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.sectionTitle}>
          Audit Log
          <span style={styles.count}>{entries.length} entries</span>
        </h3>
        <button onClick={onClear} style={styles.clearButton}>
          Clear
        </button>
      </div>

      {visible.length === 0 ? (
        <div style={styles.empty}>No audit entries yet.</div>
      ) : (
        <div style={styles.logList}>
          {[...visible].reverse().map((entry, i) => (
            <div key={`${entry.timestamp}-${i}`} style={styles.logRow}>
              <span style={styles.timestamp}>
                {formatTime(entry.timestamp)}
              </span>
              <span style={decisionStyle(entry.decision)}>
                {entry.decision}
              </span>
              <span style={styles.userId}>{entry.userId}</span>
              <span style={styles.action}>{entry.action}</span>
              {entry.toolName && (
                <span style={styles.toolName}>{entry.toolName}</span>
              )}
              {entry.details && (
                <span style={styles.details}>{entry.details}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return timestamp;
  }
}

function decisionStyle(decision: string): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  };

  switch (decision) {
    case 'allowed':
      return { ...base, backgroundColor: '#166534', color: '#4ade80' };
    case 'denied':
      return { ...base, backgroundColor: '#7f1d1d', color: '#fca5a5' };
    case 'pending':
      return { ...base, backgroundColor: '#78350f', color: '#fcd34d' };
    default:
      return { ...base, backgroundColor: '#1e293b', color: '#94a3b8' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    height: '100%',
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
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  count: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 400,
  },
  clearButton: {
    background: 'none',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#94a3b8',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  empty: {
    color: '#64748b',
    fontSize: '14px',
    padding: '24px',
    textAlign: 'center',
  },
  logList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    fontSize: '12px',
  },
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '4px',
    backgroundColor: '#0f172a',
  },
  timestamp: {
    color: '#64748b',
    fontSize: '11px',
    flexShrink: 0,
  },
  userId: {
    color: '#60a5fa',
    fontSize: '12px',
    flexShrink: 0,
  },
  action: {
    color: '#e2e8f0',
    fontSize: '12px',
  },
  toolName: {
    color: '#a5b4fc',
    fontSize: '11px',
    backgroundColor: '#1e1b4b',
    padding: '1px 6px',
    borderRadius: '3px',
  },
  details: {
    color: '#94a3b8',
    fontSize: '11px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
