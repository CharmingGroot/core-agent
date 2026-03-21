import type { MemoryEntry, MemoryManagerOptions, ShortTermMemory } from './types.js';
import { EntityExtractor } from './entity-extractor.js';
import { ContextAugmenter } from './context-augmenter.js';
import type { RawTurn } from './entity-extractor.js';

/**
 * 단기/장기 하이브리드 메모리 관리자
 *
 * 사용 흐름:
 * 1. 사용자 요청 전: augmentContext()로 관련 메모리를 시스템 프롬프트에 주입
 * 2. 에이전트 응답 후: recordTurn()으로 대화를 엔티티 구조로 요약해 저장
 */
export class MemoryManager {
  private readonly extractor: EntityExtractor;
  private readonly augmenter: ContextAugmenter;
  private readonly shortTermMap = new Map<string, ShortTermMemory>();
  private readonly shortTermSize: number;

  constructor(options: MemoryManagerOptions) {
    this.shortTermSize = options.shortTermSize ?? 5;
    this.extractor = new EntityExtractor();
    this.augmenter = new ContextAugmenter(options.store);
  }

  /**
   * 사용자 입력 전에 호출 — 시스템 프롬프트 애드온을 반환합니다
   */
  async augmentContext(userInput: string, sessionId: string): Promise<string> {
    const shortTerm = this.getShortTerm(sessionId);
    const context = await this.augmenter.augment(
      userInput,
      sessionId,
      shortTerm.entries
    );
    return this.augmenter.buildSystemPromptAddon(context);
  }

  /**
   * 에이전트 응답 완료 후 호출 — 대화를 메모리에 기록합니다
   */
  async recordTurn(turn: RawTurn, sessionId: string): Promise<MemoryEntry> {
    const entry = this.extractor.extract(turn, sessionId);

    // 단기 메모리에 추가
    const shortTerm = this.getShortTerm(sessionId);
    shortTerm.entries.push(entry);
    if (shortTerm.entries.length > shortTerm.maxSize) {
      shortTerm.entries.shift();
    }

    return entry;
  }

  /**
   * 단기 메모리를 장기 메모리로 플러시합니다 (세션 종료 시 호출)
   */
  async flush(sessionId: string, store: { save(e: MemoryEntry): Promise<void> }): Promise<void> {
    const shortTerm = this.shortTermMap.get(sessionId);
    if (!shortTerm) return;

    for (const entry of shortTerm.entries) {
      await store.save(entry);
    }

    this.shortTermMap.delete(sessionId);
  }

  getShortTermEntries(sessionId: string): MemoryEntry[] {
    return this.getShortTerm(sessionId).entries;
  }

  private getShortTerm(sessionId: string): ShortTermMemory {
    if (!this.shortTermMap.has(sessionId)) {
      this.shortTermMap.set(sessionId, {
        sessionId,
        entries: [],
        maxSize: this.shortTermSize,
      });
    }
    return this.shortTermMap.get(sessionId)!;
  }
}
