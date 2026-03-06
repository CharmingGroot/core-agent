import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc-channels.js';
const api = {
    sendMessage: (message) => {
        ipcRenderer.send(IPC_CHANNELS.SEND_MESSAGE, message);
    },
    abort: () => {
        ipcRenderer.send(IPC_CHANNELS.ABORT);
    },
    getConfig: () => {
        ipcRenderer.send(IPC_CHANNELS.GET_CONFIG);
    },
    setConfig: (config) => {
        ipcRenderer.send(IPC_CHANNELS.SET_CONFIG, config);
    },
    onAgentEvent: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on(IPC_CHANNELS.AGENT_EVENT, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_EVENT, handler);
    },
    onAgentResponse: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on(IPC_CHANNELS.AGENT_RESPONSE, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_RESPONSE, handler);
    },
    onAgentError: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on(IPC_CHANNELS.AGENT_ERROR, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.AGENT_ERROR, handler);
    },
    onConfigValue: (callback) => {
        const handler = (_event, config) => callback(config);
        ipcRenderer.on(IPC_CHANNELS.CONFIG_VALUE, handler);
        return () => ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_VALUE, handler);
    },
};
contextBridge.exposeInMainWorld('electronApi', api);
//# sourceMappingURL=preload.js.map