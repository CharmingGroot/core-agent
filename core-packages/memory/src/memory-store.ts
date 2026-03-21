import type { IMemoryStore, MemoryEntry, MemorySearchQuery } from './types.js';

/**
 * 인메모리 장기 메모리 저장소
 *
 * 키워드 기반 유사도 검색을 지원합니다.
 * 실제 프로덕션에서는 SQLite, PostgreSQL + pgvector, Milvus 등으로 교체 가능합니다.
 * IMemoryStore 인터페이스만 구현하면 됩니다.
 */
export class InMemoryStore implements IMemoryStore {
  private entries: MemoryEntry[] = [];

  async save(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async search(query: MemorySearchQuery): Promise<MemoryEntry[]> {
    const { keywords, sessionId, limit = 5, excludeSessionId } = query;

    const scored = this.entries
      .filter(e => {
        if (sessionId && e.sessionId !== sessionId) return false;
        if (excludeSessionId && e.sessionId === excludeSessionId) return false;
        return true;
      })
      .map(entry => ({
        entry,
        score: this.similarity(keywords, entry),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ entry }) => entry);
  }

  async getBySession(sessionId: string, limit = 10): Promise<MemoryEntry[]> {
    return this.entries
      .filter(e => e.sessionId === sessionId)
      .slice(-limit);
  }

  async clear(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.entries = this.entries.filter(e => e.sessionId !== sessionId);
    } else {
      this.entries = [];
    }
  }

  /**
   * 키워드 기반 jaccard 유사도 점수 계산
   */
  private similarity(queryKeywords: string[], entry: MemoryEntry): number {
    const entryTerms = new Set([
      ...entry.keywords,
      ...entry.entities,
      entry.topic,
      entry.intent,
    ].map(t => t.toLowerCase()));

    const queryTerms = new Set(queryKeywords.map(k => k.toLowerCase()));

    let hits = 0;
    for (const term of queryTerms) {
      if (entryTerms.has(term)) hits++;
      // 부분 매칭
      for (const entryTerm of entryTerms) {
        if (entryTerm.includes(term) || term.includes(entryTerm)) {
          hits += 0.5;
          break;
        }
      }
    }

    return hits / Math.max(queryTerms.size, 1);
  }
}
