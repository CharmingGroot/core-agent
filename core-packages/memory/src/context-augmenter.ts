import type { IMemoryStore, AugmentedContext, MemoryEntry } from './types.js';

/**
 * 다음 요청 전에 관련 메모리를 검색해 LLM 컨텍스트에 주입합니다.
 *
 * 흐름:
 * 1. 사용자 입력에서 키워드 추출
 * 2. 단기 메모리(현재 세션 최근 N개) + 장기 메모리(키워드 유사도 검색) 조회
 * 3. 시스템 프롬프트에 주입할 메모리 요약 생성
 */
export class ContextAugmenter {
  constructor(private readonly store: IMemoryStore) {}

  async augment(
    userInput: string,
    sessionId: string,
    shortTermEntries: MemoryEntry[]
  ): Promise<AugmentedContext> {
    const keywords = this.extractQueryKeywords(userInput);

    // 장기 메모리: 현재 세션 제외하고 유사한 기억 검색
    const longTermMemories = await this.store.search({
      keywords,
      excludeSessionId: sessionId,
      limit: 3,
    });

    // 현재 세션의 관련 기억도 검색
    const sessionMemories = await this.store.search({
      keywords,
      sessionId,
      limit: 3,
    });

    const injectedMemories = this.dedup([...sessionMemories, ...longTermMemories]);

    return {
      shortTermSummary: this.buildShortTermSummary(shortTermEntries),
      longTermSummary: this.buildLongTermSummary(longTermMemories),
      injectedMemories,
    };
  }

  /**
   * 컨텍스트를 시스템 프롬프트에 추가할 텍스트로 변환합니다.
   */
  buildSystemPromptAddon(context: AugmentedContext): string {
    const parts: string[] = [];

    if (context.shortTermSummary) {
      parts.push(`## 이번 대화 요약\n${context.shortTermSummary}`);
    }

    if (context.longTermSummary) {
      parts.push(`## 이전에 다룬 내용\n${context.longTermSummary}`);
    }

    if (parts.length === 0) return '';

    return `\n\n---\n${parts.join('\n\n')}`;
  }

  private extractQueryKeywords(input: string): string[] {
    const mathTerms = [
      '미분', '적분', '이차방정식', '이차함수', '삼각함수', '수열',
      '확률', '로그', '지수', '벡터', '극한', '인수분해', '근의 공식',
      '판별식', '등차', '등비', '점화식', '극값', '도함수',
    ];

    const found = mathTerms.filter(term => input.includes(term));

    // 2글자 이상 단어도 추가
    const words = input
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);

    return [...new Set([...found, ...words])].slice(0, 10);
  }

  private buildShortTermSummary(entries: MemoryEntry[]): string {
    if (entries.length === 0) return '';

    return entries
      .slice(-3)
      .map(e => `- [${e.topic}] ${e.intent}: ${e.result}`)
      .join('\n');
  }

  private buildLongTermSummary(entries: MemoryEntry[]): string {
    if (entries.length === 0) return '';

    return entries
      .map(e => `- ${e.topic} (${e.entities.join(', ')}): ${e.result}`)
      .join('\n');
  }

  private dedup(entries: MemoryEntry[]): MemoryEntry[] {
    const seen = new Set<string>();
    return entries.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }
}
