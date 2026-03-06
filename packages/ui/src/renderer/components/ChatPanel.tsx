import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessage, AppConfig } from '../types.js';
import { MessageBubble } from './MessageBubble.js';

interface ChatPanelProps {
  messages: readonly ChatMessage[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onAbort: () => void;
}

export function ChatPanel({
  messages,
  isLoading,
  onSendMessage,
  onAbort,
}: ChatPanelProps): React.ReactElement {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  }, [input, isLoading, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div style={styles.container}>
      <div style={styles.messagesArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>{'>'}_</div>
            <div style={styles.emptyTitle}>CLI Agent</div>
            <div style={styles.emptySubtitle}>
              Send a message to start a conversation
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div style={styles.loadingIndicator}>
            <span style={styles.loadingDot}>{'...'}</span> Thinking
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={styles.inputArea}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? 'Agent is working...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
          disabled={isLoading}
          rows={2}
          style={styles.textarea}
        />
        <div style={styles.inputActions}>
          {isLoading ? (
            <button onClick={onAbort} style={styles.abortButton}>
              Stop
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              style={{
                ...styles.sendButton,
                opacity: input.trim() ? 1 : 0.5,
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#0f172a',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: '#64748b',
    gap: '8px',
  },
  emptyIcon: {
    fontSize: '48px',
    fontFamily: 'monospace',
    color: '#334155',
  },
  emptyTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  emptySubtitle: {
    fontSize: '14px',
  },
  loadingIndicator: {
    padding: '8px 16px',
    color: '#60a5fa',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  loadingDot: {
    fontFamily: 'monospace',
    animation: 'pulse 1.5s infinite',
  },
  inputArea: {
    borderTop: '1px solid #1e293b',
    padding: '12px 16px',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
    backgroundColor: '#0f172a',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    backgroundColor: '#1e293b',
    color: '#e2e8f0',
    outline: 'none',
    lineHeight: '1.5',
  },
  inputActions: {
    display: 'flex',
    gap: '4px',
  },
  sendButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '14px',
  },
  abortButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#dc2626',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '14px',
  },
};
