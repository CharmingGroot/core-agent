import { ipcMain, type BrowserWindow } from 'electron';
import { EventBus, Registry, RunContext, parseAgentConfig } from '@cli-agent/core';
import type { ITool, AgentConfig } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import { AgentLoop } from '@cli-agent/agent';
import { IPC_CHANNELS } from './ipc-channels.js';
import type { ConfigPayload, AgentEventPayload } from './ipc-channels.js';

let currentAgent: AgentLoop | undefined;
let currentConfig: ConfigPayload | undefined;

function buildAgentConfig(payload: ConfigPayload): AgentConfig {
  return parseAgentConfig({
    provider: {
      providerId: payload.providerId,
      model: payload.model,
      auth: { type: 'api-key', apiKey: payload.apiKey },
      baseUrl: payload.baseUrl,
      maxTokens: payload.maxTokens,
      temperature: payload.temperature,
    },
    systemPrompt: payload.systemPrompt,
    workingDirectory: payload.workingDirectory,
    maxIterations: 50,
  });
}

function createAgentWithEvents(config: AgentConfig, window: BrowserWindow): AgentLoop {
  const provider = createProvider(config.provider);
  const toolRegistry = createToolRegistry();
  const eventBus = new EventBus();

  const eventNames = [
    'agent:start', 'agent:end', 'agent:error',
    'llm:request', 'llm:response', 'llm:stream',
    'tool:start', 'tool:end', 'tool:permission',
  ] as const;

  for (const eventName of eventNames) {
    eventBus.on(eventName, (data: Record<string, unknown>) => {
      if (!window.isDestroyed()) {
        const payload: AgentEventPayload = { type: eventName, data: sanitizeForIpc(data) };
        window.webContents.send(IPC_CHANNELS.AGENT_EVENT, payload);
      }
    });
  }

  return new AgentLoop({ provider, toolRegistry, config, eventBus });
}

function sanitizeForIpc(obj: unknown): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(obj, (_key, value) => {
      if (value instanceof Error) {
        return { message: value.message, name: value.name, stack: value.stack };
      }
      return value;
    }));
  } catch {
    return { error: 'Failed to serialize event data' };
  }
}

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.on(IPC_CHANNELS.SEND_MESSAGE, async (event, message: string) => {
    if (!currentConfig) {
      window.webContents.send(IPC_CHANNELS.AGENT_ERROR, {
        message: 'No configuration set. Please configure the agent first.',
        code: 'NO_CONFIG',
      });
      return;
    }

    try {
      const config = buildAgentConfig(currentConfig);
      currentAgent = createAgentWithEvents(config, window);

      const result = await currentAgent.run(message);
      window.webContents.send(IPC_CHANNELS.AGENT_RESPONSE, {
        content: result.content,
        runId: result.runId,
        iterations: result.iterations,
        aborted: result.aborted,
      });
    } catch (error) {
      window.webContents.send(IPC_CHANNELS.AGENT_ERROR, {
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof Error && 'code' in error ? (error as { code: string }).code : undefined,
      });
    } finally {
      currentAgent = undefined;
    }
  });

  ipcMain.on(IPC_CHANNELS.ABORT, () => {
    currentAgent?.abort('User requested abort');
  });

  ipcMain.on(IPC_CHANNELS.GET_CONFIG, () => {
    if (currentConfig) {
      window.webContents.send(IPC_CHANNELS.CONFIG_VALUE, currentConfig);
    }
  });

  ipcMain.on(IPC_CHANNELS.SET_CONFIG, (_event, config: ConfigPayload) => {
    currentConfig = config;
  });
}

export function removeIpcHandlers(): void {
  ipcMain.removeAllListeners(IPC_CHANNELS.SEND_MESSAGE);
  ipcMain.removeAllListeners(IPC_CHANNELS.ABORT);
  ipcMain.removeAllListeners(IPC_CHANNELS.GET_CONFIG);
  ipcMain.removeAllListeners(IPC_CHANNELS.SET_CONFIG);
}
