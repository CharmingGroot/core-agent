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
//# sourceMappingURL=preload.d.ts.map