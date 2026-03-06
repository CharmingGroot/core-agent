export const IPC_CHANNELS = {
  // Renderer -> Main
  SEND_MESSAGE: 'agent:send-message',
  ABORT: 'agent:abort',
  GET_CONFIG: 'config:get',
  SET_CONFIG: 'config:set',

  // Main -> Renderer
  AGENT_EVENT: 'agent:event',
  AGENT_RESPONSE: 'agent:response',
  AGENT_ERROR: 'agent:error',
  CONFIG_VALUE: 'config:value',
} as const;

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
