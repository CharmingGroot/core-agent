/**
 * 컨텍스트 윈도우 엔지니어링 타입.
 * sLLM(32k)에서도 동작하기 위한 토큰 버짓 관리.
 */

export interface ContextBudget {
  /** 전체 컨텍스트 윈도우 크기 (tokens) */
  readonly totalLimit: number;
  /** LLM 응답 예약 토큰 */
  readonly reserveForResponse: number;
  /** 섹션별 토큰 상한 */
  readonly sections: SectionBudgets;
}

export interface SectionBudgets {
  /** 시스템 프롬프트 (soul + skill prompt + memory) */
  readonly system: number;
  /** 도구 설명 */
  readonly tools: number;
  /** 대화 히스토리 (user + assistant + tool_result) */
  readonly history: number;
}

export interface SectionUsage {
  readonly system: TokenUsageInfo;
  readonly tools: TokenUsageInfo;
  readonly history: TokenUsageInfo;
  readonly total: number;
  readonly remaining: number;
}

export interface TokenUsageInfo {
  readonly used: number;
  readonly limit: number;
  readonly percent: number;
}

/** 히스토리 압축 결과 */
export interface CompressedMessages {
  /** 압축된 메시지 배열 */
  readonly messages: readonly ContextMessage[];
  /** 압축 전 토큰 수 */
  readonly originalTokens: number;
  /** 압축 후 토큰 수 */
  readonly compressedTokens: number;
  /** 요약에 포함된 원본 메시지 수 */
  readonly summarizedCount: number;
}

/** 컨텍스트 조립 결과 */
export interface AssembledContext {
  /** 시스템 프롬프트 */
  readonly systemPrompt: string;
  /** 도구 설명 (skill-scoped) */
  readonly tools: readonly ToolDescriptionRef[];
  /** 조립된 메시지 히스토리 */
  readonly messages: readonly ContextMessage[];
  /** 사용량 정보 */
  readonly usage: SectionUsage;
  /** 압축이 발생했는지 */
  readonly wasCompressed: boolean;
}

/** 핀닝 전략 */
export type PinType =
  | 'first_tool_result'
  | 'last_n_tool_results'
  | 'error_results'
  | 'user_messages_last_n';

export interface PinRule {
  readonly type: PinType;
  readonly n?: number;
  readonly reason: string;
}

export type SummarizeStrategy = 'llm_summary' | 'key_points_only' | 'truncate';

export interface SummarizeRule {
  readonly type: 'middle_tool_results' | 'old_assistant_messages';
  readonly strategy: SummarizeStrategy;
}

export interface PinningStrategy {
  readonly pinned: readonly PinRule[];
  readonly summarizable: readonly SummarizeRule[];
}

/** 컨텍스트 메시지 (프로바이더 무관 공통 형태) */
export interface ContextMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool_result' | 'summary';
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly tokenEstimate?: number;
  readonly pinned?: boolean;
}

/** 도구 설명 참조 (토큰 추정 포함) */
export interface ToolDescriptionRef {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParamRef[];
  readonly tokenEstimate: number;
}

export interface ToolParamRef {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly required: boolean;
}

/** 사전 정의 버짓 프리셋 */
export const BUDGET_PRESETS = {
  /** 32k 모델 (Llama 3.1 8B 등) */
  SLLM_32K: {
    totalLimit: 32768,
    reserveForResponse: 4096,
    sections: { system: 2048, tools: 3072, history: 23552 },
  },
  /** 128k 모델 (GPT-4o, Claude 등) */
  LLM_128K: {
    totalLimit: 131072,
    reserveForResponse: 8192,
    sections: { system: 4096, tools: 8192, history: 110592 },
  },
  /** 200k 모델 (Claude 3.5+) */
  LLM_200K: {
    totalLimit: 204800,
    reserveForResponse: 8192,
    sections: { system: 8192, tools: 16384, history: 172032 },
  },
} as const satisfies Record<string, ContextBudget>;
