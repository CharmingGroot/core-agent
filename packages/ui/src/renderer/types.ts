export type MessageRole = 'user' | 'assistant' | 'system';

export interface ToolCallDisplay {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
  readonly status: 'running' | 'success' | 'error';
  readonly result?: string;
  readonly error?: string;
  readonly durationMs?: number;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: Date;
  readonly toolCalls?: readonly ToolCallDisplay[];
  readonly iterations?: number;
  readonly tokenUsage?: { input: number; output: number };
}

export interface AppConfig {
  providerId: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
  systemPrompt?: string;
  workingDirectory: string;
}

export type AppView = 'chat' | 'settings' | 'governance';
export type GovernanceTab = 'domains' | 'skills' | 'audit';

export type PolicyMode = 'standalone' | 'governed';

export interface DomainEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skills: readonly string[];
  readonly agents: readonly string[];
}

export interface SkillEntry {
  readonly name: string;
  readonly description: string;
  readonly tools: readonly string[];
}

export interface RuleEntry {
  readonly name: string;
  readonly phase: 'pre' | 'post';
  readonly severity: 'block' | 'warn' | 'log';
  readonly enabled: boolean;
}

export interface AuditLogEntry {
  readonly timestamp: string;
  readonly userId: string;
  readonly action: string;
  readonly decision: 'allowed' | 'denied' | 'pending';
  readonly toolName?: string;
  readonly details?: string;
}

export interface GovernanceState {
  policyMode: PolicyMode;
  domains: DomainEntry[];
  skills: SkillEntry[];
  rules: RuleEntry[];
  auditLog: AuditLogEntry[];
}
