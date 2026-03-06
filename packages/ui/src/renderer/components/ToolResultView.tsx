import React, { useState } from 'react';
import type { ToolCallDisplay } from '../types.js';

const PREVIEW_LINES = 5;

interface ToolResultViewProps {
  toolCalls: readonly ToolCallDisplay[];
}

export function ToolResultView({ toolCalls }: ToolResultViewProps): React.ReactElement {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        Tool Calls ({toolCalls.length})
      </div>
      {toolCalls.map((tc) => (
        <ToolCallItem key={tc.id} toolCall={tc} />
      ))}
    </div>
  );
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallDisplay }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    running: { color: '#f59e0b', icon: '\u25cb', label: 'Running' },
    success: { color: '#10b981', icon: '\u2713', label: 'Success' },
    error: { color: '#ef4444', icon: '\u2717', label: 'Failed' },
  };

  const status = statusConfig[toolCall.status];

  const resultLines = (toolCall.result ?? '').split('\n');
  const needsCollapse = resultLines.length > PREVIEW_LINES;
  const displayedResult = expanded
    ? toolCall.result
    : resultLines.slice(0, PREVIEW_LINES).join('\n');

  return (
    <div style={{ ...styles.item, borderLeftColor: status.color }}>
      <div style={styles.itemHeader} onClick={() => setExpanded(!expanded)}>
        <span style={{ color: status.color, fontWeight: 700 }}>{status.icon}</span>
        <span style={styles.toolName}>{toolCall.name}</span>
        <span style={{ color: status.color, fontSize: '11px' }}>{status.label}</span>
        {toolCall.durationMs !== undefined && (
          <span style={styles.duration}>{toolCall.durationMs}ms</span>
        )}
        <span style={styles.chevron}>{expanded ? '\u25b2' : '\u25bc'}</span>
      </div>

      {expanded && (
        <div style={styles.argsSection}>
          <div style={styles.sectionLabel}>Arguments</div>
          <pre style={styles.code}>
            {formatJson(toolCall.arguments)}
          </pre>
        </div>
      )}

      {toolCall.result && (
        <div style={styles.resultSection}>
          <pre style={styles.code}>{displayedResult}</pre>
          {needsCollapse && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              style={styles.expandBtn}
            >
              ... +{resultLines.length - PREVIEW_LINES} lines
            </button>
          )}
        </div>
      )}

      {toolCall.error && (
        <div style={styles.errorSection}>
          {toolCall.error}
        </div>
      )}
    </div>
  );
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  header: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '4px 0',
  },
  item: {
    backgroundColor: '#0f172a',
    borderLeft: '3px solid',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  toolName: {
    fontFamily: 'monospace',
    fontWeight: 600,
    color: '#f1f5f9',
    flex: 1,
  },
  duration: {
    color: '#64748b',
    fontSize: '11px',
  },
  chevron: {
    color: '#64748b',
    fontSize: '10px',
  },
  argsSection: {
    padding: '0 12px 8px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  resultSection: {
    padding: '0 12px 8px',
    borderTop: '1px solid #1e293b',
  },
  errorSection: {
    padding: '4px 12px 8px',
    color: '#fca5a5',
    fontSize: '12px',
    borderTop: '1px solid #1e293b',
  },
  code: {
    margin: 0,
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    fontSize: '12px',
    color: '#cbd5e1',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    cursor: 'pointer',
    fontSize: '11px',
    padding: '2px 0',
    fontFamily: 'monospace',
  },
};
