export const IPC_CHANNELS = {
  // Renderer -> Main
  SEND_MESSAGE: 'agent:send-message',
  ABORT: 'agent:abort',
  RESET_CHAT: 'agent:reset-chat',
  GET_CONFIG: 'config:get',
  SET_CONFIG: 'config:set',
  SELECT_DIRECTORY: 'dialog:select-directory',

  // Governance Renderer -> Main
  GOV_GET_STATE: 'gov:get-state',
  GOV_SET_MODE: 'gov:set-mode',
  GOV_ADD_DOMAIN: 'gov:add-domain',
  GOV_REMOVE_DOMAIN: 'gov:remove-domain',
  GOV_TOGGLE_RULE: 'gov:toggle-rule',
  GOV_CLEAR_AUDIT: 'gov:clear-audit',

  // Main -> Renderer
  AGENT_EVENT: 'agent:event',
  AGENT_RESPONSE: 'agent:response',
  AGENT_ERROR: 'agent:error',
  CONFIG_VALUE: 'config:value',
  DIRECTORY_SELECTED: 'dialog:directory-selected',

  // Governance Main -> Renderer
  GOV_STATE: 'gov:state',
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

export interface GovernanceStatePayload {
  readonly policyMode: 'standalone' | 'governed';
  readonly domains: readonly GovernanceDomainPayload[];
  readonly skills: readonly GovernanceSkillPayload[];
  readonly rules: readonly GovernanceRulePayload[];
  readonly auditLog: readonly GovernanceAuditPayload[];
}

export interface GovernanceDomainPayload {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly string[];
  readonly agents: readonly string[];
}

export interface GovernanceSkillPayload {
  readonly name: string;
  readonly description: string;
  readonly tools: readonly string[];
}

export interface GovernanceRulePayload {
  readonly name: string;
  readonly phase: 'pre' | 'post';
  readonly severity: 'block' | 'warn' | 'log';
  readonly enabled: boolean;
}

export interface GovernanceAuditPayload {
  readonly timestamp: string;
  readonly userId: string;
  readonly action: string;
  readonly decision: 'allowed' | 'denied' | 'pending';
  readonly toolName?: string;
  readonly details?: string;
}
