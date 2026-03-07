import React, { useState } from 'react';
import type { ChatMessage, ToolCallDisplay } from '../types.js';

const COLLAPSED_LINES = 5;

function CollapsedText({ text, maxLines }: { text: string; maxLines: number }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split('\n');

  if (lines.length <= maxLines) {
    return <pre className="message-content">{text}</pre>;
  }

  const displayed = expanded ? text : lines.slice(0, maxLines).join('\n');
  const remaining = lines.length - maxLines;

  return (
    <div>
      <pre className="message-content">{displayed}</pre>
      <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse' : `... +${remaining} lines`}
      </button>
    </div>
  );
}

function ToolCallView({ toolCall }: { toolCall: ToolCallDisplay }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const statusIcons: Record<string, string> = {
    running: '\u25cb',
    success: '\u2713',
    error: '\u2717',
  };

  const statusColors: Record<string, string> = {
    running: '#f59e0b',
    success: '#10b981',
    error: '#ef4444',
  };

  let parsedArgs = '';
  try {
    parsedArgs = JSON.stringify(JSON.parse(toolCall.arguments), null, 2);
  } catch {
    parsedArgs = toolCall.arguments;
  }

  return (
    <div className={`tool-call tool-call-${toolCall.status}`}>
      <div className="tool-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-status-icon" style={{ color: statusColors[toolCall.status] }}>
          {statusIcons[toolCall.status]}
        </span>
        <span className="tool-name">{toolCall.name}</span>
        {toolCall.durationMs !== undefined && (
          <span className="tool-duration">{toolCall.durationMs}ms</span>
        )}
        <span className="tool-chevron">{expanded ? '\u25b2' : '\u25bc'}</span>
      </div>

      {expanded && (
        <div className="tool-body">
          <div className="tool-section-label">Arguments</div>
          <pre className="tool-code">{parsedArgs}</pre>
        </div>
      )}

      {toolCall.result && (
        <div className="tool-body">
          <pre className="tool-code tool-result">
            {expanded ? toolCall.result : toolCall.result.split('\n').slice(0, COLLAPSED_LINES).join('\n')}
          </pre>
          {!expanded && toolCall.result.split('\n').length > COLLAPSED_LINES && (
            <button className="expand-btn" onClick={() => setExpanded(true)}>
              ... +{toolCall.result.split('\n').length - COLLAPSED_LINES} lines
            </button>
          )}
        </div>
      )}

      {toolCall.error && (
        <div className="tool-error">{toolCall.error}</div>
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const isUser = message.role === 'user';
  const time = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="message">
      <div className="message-header">
        <span className={`message-role ${isUser ? 'message-role-user' : 'message-role-assistant'}`}>
          {isUser ? 'You' : 'Assistant'}
        </span>
        <span className="message-time">{time}</span>
        {message.iterations !== undefined && (
          <span className="message-iterations">{message.iterations} iter</span>
        )}
      </div>

      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="tool-calls">
          {message.toolCalls.map((tc) => (
            <ToolCallView key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {message.content && (
        <CollapsedText text={message.content} maxLines={30} />
      )}
    </div>
  );
}
