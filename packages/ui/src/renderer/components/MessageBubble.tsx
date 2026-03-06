import React from 'react';
import type { ChatMessage, ToolCallDisplay } from '../types.js';

const COLLAPSED_LINES = 5;

function CollapsedText({ text, maxLines }: { text: string; maxLines: number }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const lines = text.split('\n');

  if (lines.length <= maxLines) {
    return <pre style={styles.pre}>{text}</pre>;
  }

  const displayed = expanded ? text : lines.slice(0, maxLines).join('\n');
  const remaining = lines.length - maxLines;

  return (
    <div>
      <pre style={styles.pre}>{displayed}</pre>
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.expandButton}
      >
        {expanded ? 'Collapse' : `... +${remaining} lines`}
      </button>
    </div>
  );
}

function ToolCallView({ toolCall }: { toolCall: ToolCallDisplay }): React.ReactElement {
  const statusColors: Record<string, string> = {
    running: '#f59e0b',
    success: '#10b981',
    error: '#ef4444',
  };

  const statusIcon: Record<string, string> = {
    running: '\u25cb',
    success: '\u2713',
    error: '\u2717',
  };

  let parsedArgs = '';
  try {
    parsedArgs = JSON.stringify(JSON.parse(toolCall.arguments), null, 2);
  } catch {
    parsedArgs = toolCall.arguments;
  }

  return (
    <div style={{ ...styles.toolCall, borderLeftColor: statusColors[toolCall.status] }}>
      <div style={styles.toolHeader}>
        <span style={{ color: statusColors[toolCall.status] }}>
          {statusIcon[toolCall.status]}
        </span>
        <span style={styles.toolName}>{toolCall.name}</span>
        {toolCall.durationMs !== undefined && (
          <span style={styles.toolDuration}>{toolCall.durationMs}ms</span>
        )}
      </div>
      <CollapsedText text={parsedArgs} maxLines={COLLAPSED_LINES} />
      {toolCall.result && (
        <div style={styles.toolResult}>
          <CollapsedText text={toolCall.result} maxLines={COLLAPSED_LINES} />
        </div>
      )}
      {toolCall.error && (
        <div style={styles.toolError}>{toolCall.error}</div>
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const isUser = message.role === 'user';
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ ...styles.bubble, alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        ...styles.bubbleContent,
        backgroundColor: isUser ? '#2563eb' : '#1e293b',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      }}>
        <div style={styles.roleLabel}>
          {isUser ? 'You' : 'Assistant'}
          <span style={styles.timestamp}>{time}</span>
          {message.iterations !== undefined && (
            <span style={styles.iterations}>{message.iterations} iter</span>
          )}
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div style={styles.toolCallsContainer}>
            {message.toolCalls.map((tc) => (
              <ToolCallView key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {message.content && (
          <div style={styles.messageContent}>
            <CollapsedText text={message.content} maxLines={30} />
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bubble: {
    display: 'flex',
    maxWidth: '85%',
    marginBottom: '12px',
  },
  bubbleContent: {
    padding: '12px 16px',
    color: '#e2e8f0',
    fontSize: '14px',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  roleLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  timestamp: {
    fontWeight: 400,
    color: '#64748b',
  },
  iterations: {
    fontWeight: 400,
    color: '#64748b',
    fontSize: '10px',
    backgroundColor: '#334155',
    padding: '1px 6px',
    borderRadius: '4px',
  },
  messageContent: {
    marginTop: '4px',
  },
  pre: {
    margin: 0,
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    fontSize: '13px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  expandButton: {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 0',
    fontFamily: 'monospace',
  },
  toolCallsContainer: {
    margin: '8px 0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  toolCall: {
    backgroundColor: '#0f172a',
    borderLeft: '3px solid',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '13px',
  },
  toolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
    fontWeight: 600,
  },
  toolName: {
    color: '#f1f5f9',
    fontFamily: 'monospace',
  },
  toolDuration: {
    color: '#64748b',
    fontSize: '11px',
    marginLeft: 'auto',
  },
  toolResult: {
    marginTop: '4px',
    color: '#86efac',
  },
  toolError: {
    marginTop: '4px',
    color: '#fca5a5',
    fontSize: '12px',
  },
};
