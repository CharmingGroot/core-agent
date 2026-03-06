/**
 * Harness — 전체 조립 + 도메인 구성.
 * 멀티 에이전트를 도메인별로 조합하고 라우팅한다.
 */

import type { GovernancePolicy } from './governance.js';
import type { ContextBudget } from './context.js';

export interface DomainConfig {
  /** 도메인 식별자 (e.g., "finance-team") */
  readonly id: string;
  /** 사람이 읽을 수 있는 이름 */
  readonly name: string;
  /** 이 도메인에 적용할 스킬 목록 */
  readonly skills: readonly string[];
  /** 이 도메인에 적용할 룰 목록 */
  readonly rules: readonly string[];
  /** LLM 프로바이더 설정 */
  readonly provider: DomainProviderConfig;
  /** 컨텍스트 버짓 (없으면 모델에 맞는 프리셋 자동 선택) */
  readonly contextBudget?: ContextBudget;
  /** 거버넌스 정책 (없으면 OpenPolicy) */
  readonly governance?: GovernancePolicy;
}

export interface DomainProviderConfig {
  readonly providerId: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly auth: { type: string; [key: string]: unknown };
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface HarnessConfig {
  /** 등록된 도메인 목록 */
  readonly domains: readonly DomainConfig[];
  /** 기본 도메인 ID (라우팅 실패 시 폴백) */
  readonly defaultDomainId?: string;
  /** 스킬 파일 경로 (기본: ./skills/) */
  readonly skillsDir: string;
  /** 룰 파일 경로 (기본: ./rules/) */
  readonly rulesDir: string;
}

export interface HarnessRequest {
  readonly requestId: string;
  readonly userId: string;
  readonly domainId?: string;
  readonly goal: string;
  readonly metadata?: Record<string, unknown>;
}

export interface HarnessResponse {
  readonly requestId: string;
  readonly operationId: string;
  readonly success: boolean;
  readonly content: string;
  readonly tasksExecuted: number;
  readonly totalTokens: { input: number; output: number };
  readonly totalDurationMs: number;
  readonly error?: string;
}

export type HarnessStatus = 'idle' | 'running' | 'error' | 'shutting_down';

export interface DomainStatus {
  readonly domainId: string;
  readonly activeSessions: number;
  readonly totalRequests: number;
  readonly provider: string;
  readonly model: string;
  readonly skills: readonly string[];
}
