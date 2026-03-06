export declare const IPC_CHANNELS: {
    readonly SEND_MESSAGE: "agent:send-message";
    readonly ABORT: "agent:abort";
    readonly GET_CONFIG: "config:get";
    readonly SET_CONFIG: "config:set";
    readonly AGENT_EVENT: "agent:event";
    readonly AGENT_RESPONSE: "agent:response";
    readonly AGENT_ERROR: "agent:error";
    readonly CONFIG_VALUE: "config:value";
};
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export interface AgentEventPayload {
    readonly type: string;
    readonly data: Record<string, unknown>;
}
export interface AgentResponsePayload {
    readonly content: string;
    readonly runId: string;
    readonly iterations: number;
    readonly aborted: boolean;
}
export interface AgentErrorPayload {
    readonly message: string;
    readonly code?: string;
}
export interface ConfigPayload {
    readonly providerId: string;
    readonly model: string;
    readonly apiKey: string;
    readonly baseUrl?: string;
    readonly maxTokens: number;
    readonly temperature: number;
    readonly systemPrompt?: string;
    readonly workingDirectory: string;
}
//# sourceMappingURL=ipc-channels.d.ts.map