import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage, ToolCallDisplay, AppConfig } from '../types.js';
import type { ElectronApi } from '../electron-api.js';

declare global {
  interface Window {
    electronApi: ElectronApi;
  }
}

let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter++;
  return `msg-${messageIdCounter}-${Date.now()}`;
}

export interface UseAgentReturn {
  messages: readonly ChatMessage[];
  isLoading: boolean;
  sendMessage: (content: string) => void;
  abort: () => void;
  clearMessages: () => void;
}

export function useAgent(config: AppConfig | null): UseAgentReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const toolCallsRef = useRef<Map<string, ToolCallDisplay>>(new Map());

  useEffect(() => {
    if (!window.electronApi) return;

    const unsubEvent = window.electronApi.onAgentEvent((payload) => {
      const { type, data } = payload;

      if (type === 'tool:start') {
        const toolCall = data['toolCall'] as { id: string; name: string; arguments: string };
        const display: ToolCallDisplay = {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments,
          status: 'running',
        };
        toolCallsRef.current.set(toolCall.id, display);
      }

      if (type === 'tool:end') {
        const toolCall = data['toolCall'] as { id: string; name: string };
        const result = data['result'] as { success: boolean; output: string; error?: string };
        const existing = toolCallsRef.current.get(toolCall.id);
        if (existing) {
          toolCallsRef.current.set(toolCall.id, {
            ...existing,
            status: result.success ? 'success' : 'error',
            result: result.output,
            error: result.error,
          });
        }
      }
    });

    const unsubResponse = window.electronApi.onAgentResponse((payload) => {
      const toolCalls = [...toolCallsRef.current.values()];
      toolCallsRef.current.clear();

      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: payload.content,
          timestamp: new Date(),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          iterations: payload.iterations,
        },
      ]);
      setIsLoading(false);
    });

    const unsubError = window.electronApi.onAgentError((payload) => {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId(),
          role: 'assistant',
          content: `Error: ${payload.message}`,
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
    });

    return () => {
      unsubEvent();
      unsubResponse();
      unsubError();
    };
  }, []);

  useEffect(() => {
    if (config && window.electronApi) {
      window.electronApi.setConfig(config);
    }
  }, [config]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim() || isLoading) return;

    setMessages((prev) => [
      ...prev,
      {
        id: nextMessageId(),
        role: 'user',
        content,
        timestamp: new Date(),
      },
    ]);

    setIsLoading(true);
    toolCallsRef.current.clear();
    window.electronApi?.sendMessage(content);
  }, [isLoading]);

  const abort = useCallback(() => {
    window.electronApi?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    window.electronApi?.resetChat();
  }, []);

  return { messages, isLoading, sendMessage, abort, clearMessages };
}
