/**
 * Profile — tool access control unit for governed mode.
 * Assigned to users by administrators.
 * Profiles define which tools a user can see, use, and which require approval.
 */

export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Explicitly allowed tools. Supports wildcards: "github__*" */
  readonly allowedTools: readonly string[];
  /** Explicitly denied tools. Takes priority over allowedTools. */
  readonly deniedTools: readonly string[];
  /** Tools that require user/admin approval before execution. */
  readonly approvalRequired: readonly string[];
  /** Allowed skills */
  readonly allowedSkills: readonly string[];
  /** Denied skills */
  readonly deniedSkills: readonly string[];
  /** Additional policy constraints */
  readonly policy: ProfilePolicy;
}

export interface ProfilePolicy {
  readonly maxToolCallsPerSession: number;
  readonly auditLevel: 'none' | 'basic' | 'full';
  readonly allowedProviders: readonly string[];
  readonly dataClassification: 'public' | 'internal' | 'confidential' | 'restricted';
}

/** Result of matching a tool name against profile rules */
export type ToolAccessDecision = 'allowed' | 'denied' | 'requires_approval';

/** Default profile constants */
export const OPEN_PROFILE_ID = 'open';
