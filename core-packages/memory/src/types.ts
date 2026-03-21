/**
 * 대화 한 턴을 엔티티 구조로 요약한 메모리 단위
 */
export interface MemoryEntry {
  id: string;
  sessionId: string;
  createdAt: Date;
  /** 대화 주제 (예: "이차방정식 풀이", "미분 개념") */
  topic: string;
  /** 사용자 의도 (예: "문제 풀이 요청", "개념 이해") */
  intent: string;
  /** 핵심 엔티티 목록 (예: ["이차방정식", "판별식", "근의 공식"]) */
  entities: string[];
  /** 결과 요약 (예: "근의 공식으로 x=2, x=-3 도출") */
  result: string;
  /** 검색용 키워드 */
  keywords: string[];
}

/**
 * 단기 메모리: 현재 세션의 최근 N개 대화 요약
 */
export interface ShortTermMemory {
  sessionId: string;
  entries: MemoryEntry[];
  maxSize: number;
}

/**
 * 장기 메모리 저장소 인터페이스
 */
export interface IMemoryStore {
  save(entry: MemoryEntry): Promise<void>;
  search(query: MemorySearchQuery): Promise<MemoryEntry[]>;
  getBySession(sessionId: string, limit?: number): Promise<MemoryEntry[]>;
  clear(sessionId?: string): Promise<void>;
}

export interface MemorySearchQuery {
  keywords: string[];
  sessionId?: string;
  limit?: number;
  excludeSessionId?: string;
}

/**
 * 컨텍스트 증강 결과: LLM에 주입할 메모리 요약
 */
export interface AugmentedContext {
  shortTermSummary: string;
  longTermSummary: string;
  injectedMemories: MemoryEntry[];
}

export interface MemoryManagerOptions {
  shortTermSize?: number;
  longTermSearchLimit?: number;
  store: IMemoryStore;
}
