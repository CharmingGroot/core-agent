import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc-channels.js';
import type { ConfigPayload, AgentEventPayload, AgentResponsePayload, AgentErrorPayload } from './ipc-channels.js';

export interface ElectronApi {
  sendMessage: (message: string) => void;
  abort: () => void;
  getConfig: () => void;
  setConfig: (config: ConfigPayload) => void;
  onAgentEvent: (callback: (payload: AgentEventPayload) => void) => () => void;
  onAgentResponse: (callback: (payload: AgentResponsePayload) => void) => () => void;
  onAgentError: (callback: (payload: AgentErrorPayload) => void) => () => void;
  onConfigValue: (callback: (config: ConfigPayload) => void) => () => void;
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
};

contextBridge.exposeInMainWorld('electronApi', api);
