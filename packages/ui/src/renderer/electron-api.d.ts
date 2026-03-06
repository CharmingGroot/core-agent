/** Shared type for the exposed Electron API. Mirrors preload.ts ElectronApi. */
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

export interface ConfigPayload {
  providerId: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
  workingDirectory: string;
}

export interface AgentEventPayload {
  type: string;
  data: Record<string, unknown>;
}

export interface AgentResponsePayload {
  content: string;
  runId: string;
  iterations: number;
  aborted: boolean;
}

export interface AgentErrorPayload {
  message: string;
  code?: string;
}
