// Registry
export { RuleRegistry } from './rule-registry.js';

// Engine
export { RuleEngine } from './rule-engine.js';
export type { PreEvaluationResult, PostEvaluationResult } from './rule-engine.js';

// Built-in rules
export {
  NoDestructiveCommandRule,
  AuditLogRule,
  SandboxOnlyRule,
  PiiRedactRule,
  MaxToolCallsRule,
} from './built-in-rules.js';

// Governed-mode rules
export {
  RequireApprovalRule,
  RateLimiterRule,
  DomainScopeRule,
  ReflectAfterEditRule,
  SessionIsolationRule,
  createGovernedRules,
} from './governed-rules.js';
export type { GovernedRulesOptions } from './governed-rules.js';
