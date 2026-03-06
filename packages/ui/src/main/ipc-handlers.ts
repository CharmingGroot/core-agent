import { ipcMain, type BrowserWindow } from 'electron';
import { EventBus, Registry, RunContext, parseAgentConfig } from '@cli-agent/core';
import type { ITool, AgentConfig } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import { AgentLoop } from '@cli-agent/agent';
import { IPC_CHANNELS } from './ipc-channels.js';
import type { ConfigPayload, AgentEventPayload, GovernanceDomainPayload } from './ipc-channels.js';
import { GovernanceHandler } from './governance-handler.js';

let currentAgent: AgentLoop | undefined;
let currentConfig: ConfigPayload | undefined;
const governanceHandler = new GovernanceHandler();

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
  ipcMain.on(IPC_CHANNELS.SEND_MESSAGE, async (_event, message: string) => {
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

  // Governance IPC handlers
  ipcMain.on(IPC_CHANNELS.GOV_GET_STATE, () => {
    window.webContents.send(IPC_CHANNELS.GOV_STATE, governanceHandler.getState());
  });

  ipcMain.on(IPC_CHANNELS.GOV_SET_MODE, (_event, mode: 'standalone' | 'governed') => {
    const state = governanceHandler.setMode(mode);
    window.webContents.send(IPC_CHANNELS.GOV_STATE, state);
  });

  ipcMain.on(IPC_CHANNELS.GOV_ADD_DOMAIN, (_event, domain: Omit<GovernanceDomainPayload, 'id'>) => {
    const state = governanceHandler.addDomain(domain);
    window.webContents.send(IPC_CHANNELS.GOV_STATE, state);
  });

  ipcMain.on(IPC_CHANNELS.GOV_REMOVE_DOMAIN, (_event, id: string) => {
    const state = governanceHandler.removeDomain(id);
    window.webContents.send(IPC_CHANNELS.GOV_STATE, state);
  });

  ipcMain.on(IPC_CHANNELS.GOV_TOGGLE_RULE, (_event, ruleName: string) => {
    const state = governanceHandler.toggleRule(ruleName);
    window.webContents.send(IPC_CHANNELS.GOV_STATE, state);
  });

  ipcMain.on(IPC_CHANNELS.GOV_CLEAR_AUDIT, () => {
    const state = governanceHandler.clearAudit();
    window.webContents.send(IPC_CHANNELS.GOV_STATE, state);
  });
}

export function removeIpcHandlers(): void {
  ipcMain.removeAllListeners(IPC_CHANNELS.SEND_MESSAGE);
  ipcMain.removeAllListeners(IPC_CHANNELS.ABORT);
  ipcMain.removeAllListeners(IPC_CHANNELS.GET_CONFIG);
  ipcMain.removeAllListeners(IPC_CHANNELS.SET_CONFIG);
  ipcMain.removeAllListeners(IPC_CHANNELS.GOV_GET_STATE);
  ipcMain.removeAllListeners(IPC_CHANNELS.GOV_SET_MODE);
  ipcMain.removeAllListeners(IPC_CHANNELS.GOV_ADD_DOMAIN);
  ipcMain.removeAllListeners(IPC_CHANNELS.GOV_REMOVE_DOMAIN);
  ipcMain.removeAllListeners(IPC_CHANNELS.GOV_TOGGLE_RULE);
  ipcMain.removeAllListeners(IPC_CHANNELS.GOV_CLEAR_AUDIT);
}
