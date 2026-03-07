import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessage } from '../types.js';
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

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
    <>
      <div className="messages">
        <div className="messages-inner">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{'>'}_</div>
              <div className="empty-title">Chamelion</div>
              <div className="empty-subtitle">Send a message to start a conversation</div>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <div className="loading">
              <span className="loading-dots">Thinking</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="input-area">
        <div className="input-inner">
          <textarea
            ref={textareaRef}
            className="input-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Agent is working...' : 'Message... (Enter to send, Shift+Enter for newline)'}
            disabled={isLoading}
            rows={1}
          />
          {isLoading ? (
            <button className="btn btn-danger" onClick={onAbort}>Stop</button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </>
  );
}
