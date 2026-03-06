import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc-channels.js';
import type {
  ConfigPayload,
  AgentEventPayload,
  AgentResponsePayload,
  AgentErrorPayload,
  GovernanceStatePayload,
  GovernanceDomainPayload,
} from './ipc-channels.js';

export interface ElectronApi {
  sendMessage: (message: string) => void;
  abort: () => void;
  getConfig: () => void;
  setConfig: (config: ConfigPayload) => void;
  onAgentEvent: (callback: (payload: AgentEventPayload) => void) => () => void;
  onAgentResponse: (callback: (payload: AgentResponsePayload) => void) => () => void;
  onAgentError: (callback: (payload: AgentErrorPayload) => void) => () => void;
  onConfigValue: (callback: (config: ConfigPayload) => void) => () => void;

  // Governance API
  govGetState: () => void;
  govSetMode: (mode: 'standalone' | 'governed') => void;
  govAddDomain: (domain: Omit<GovernanceDomainPayload, 'id'>) => void;
  govRemoveDomain: (id: string) => void;
  govToggleRule: (ruleName: string) => void;
  govClearAudit: () => void;
  onGovState: (callback: (state: GovernanceStatePayload) => void) => () => void;
}

const api: ElectronApi = {
  sendMessage: (message: string) => {
    ipcRenderer.send(IPC_CHANNELS.SEND_MESSAGE, message);
  },
  abort: () => {
    ipcRenderer.send(IPC_CHANNELS.ABORT);
  },
  getConfig: () => {
    ipcRenderer.send(IPC_CHANNELS.GET_CONFIG);
  },
  setConfig: (config: ConfigPayload) => {
    ipcRenderer.send(IPC_CHANNELS.SET_CONFIG, config);
  },
  onAgentEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentEventPayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler);
  },
  onAgentResponse: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentResponsePayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.AGENT_RESPONSE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_RESPONSE, handler);
  },
  onAgentError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentErrorPayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.AGENT_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_ERROR, handler);
  },
  onConfigValue: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, config: ConfigPayload) => callback(config);
    ipcRenderer.on(IPC_CHANNELS.CONFIG_VALUE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_VALUE, handler);
  },

  // Governance API
  govGetState: () => {
    ipcRenderer.send(IPC_CHANNELS.GOV_GET_STATE);
  },
  govSetMode: (mode: 'standalone' | 'governed') => {
    ipcRenderer.send(IPC_CHANNELS.GOV_SET_MODE, mode);
  },
  govAddDomain: (domain: Omit<GovernanceDomainPayload, 'id'>) => {
    ipcRenderer.send(IPC_CHANNELS.GOV_ADD_DOMAIN, domain);
  },
  govRemoveDomain: (id: string) => {
    ipcRenderer.send(IPC_CHANNELS.GOV_REMOVE_DOMAIN, id);
  },
  govToggleRule: (ruleName: string) => {
    ipcRenderer.send(IPC_CHANNELS.GOV_TOGGLE_RULE, ruleName);
  },
  govClearAudit: () => {
    ipcRenderer.send(IPC_CHANNELS.GOV_CLEAR_AUDIT);
  },
  onGovState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: GovernanceStatePayload) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.GOV_STATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.GOV_STATE, handler);
  },
};

contextBridge.exposeInMainWorld('electronApi', api);
