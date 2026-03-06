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

  // Governance API
  govGetState: () => void;
  govSetMode: (mode: 'standalone' | 'governed') => void;
  govAddDomain: (domain: Omit<GovernanceDomainPayload, 'id'>) => void;
  govRemoveDomain: (id: string) => void;
  govToggleRule: (ruleName: string) => void;
  govClearAudit: () => void;
  onGovState: (callback: (state: GovernanceStatePayload) => void) => () => void;
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

export interface GovernanceStatePayload {
  policyMode: 'standalone' | 'governed';
  domains: readonly GovernanceDomainPayload[];
  skills: readonly GovernanceSkillPayload[];
  rules: readonly GovernanceRulePayload[];
  auditLog: readonly GovernanceAuditPayload[];
}

export interface GovernanceDomainPayload {
  id: string;
  name: string;
  description: string;
  skills: readonly string[];
  agents: readonly string[];
}

export interface GovernanceSkillPayload {
  name: string;
  description: string;
  tools: readonly string[];
}

export interface GovernanceRulePayload {
  name: string;
  phase: 'pre' | 'post';
  severity: 'block' | 'warn' | 'log';
  enabled: boolean;
}

export interface GovernanceAuditPayload {
  timestamp: string;
  userId: string;
  action: string;
  decision: 'allowed' | 'denied' | 'pending';
  toolName?: string;
  details?: string;
}
