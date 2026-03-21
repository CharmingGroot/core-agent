import type { MemoryEntry } from './types.js';

export interface RawTurn {
  userMessage: string;
  assistantResponse: string;
}

/**
 * 대화 한 턴을 topic/intent/entities/result/keywords 구조로 요약합니다.
 *
 * LLM 호출 없이 규칙 기반으로 추출합니다 (포터블, 인프라 의존 없음).
 * 실제 프로덕션에서는 이 클래스를 LLM 기반 추출기로 교체할 수 있습니다.
 */
export class EntityExtractor {
  extract(turn: RawTurn, sessionId: string): MemoryEntry {
    const userMsg = turn.userMessage.toLowerCase();
    const assistantMsg = turn.assistantResponse.toLowerCase();

    return {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId,
      createdAt: new Date(),
      topic: this.extractTopic(userMsg),
      intent: this.extractIntent(userMsg),
      entities: this.extractEntities(userMsg + ' ' + assistantMsg),
      result: this.extractResult(turn.assistantResponse),
      keywords: this.extractKeywords(userMsg + ' ' + assistantMsg),
    };
  }

  private extractTopic(text: string): string {
    const topicPatterns: [RegExp, string][] = [
      [/미분|도함수|극값|극대|극소/, '미분'],
      [/적분|넓이|부정적분|정적분/, '적분'],
      [/이차방정식|이차함수|포물선/, '이차방정식/이차함수'],
      [/삼각함수|사인|코사인|탄젠트|sin|cos|tan/, '삼각함수'],
      [/수열|등차|등비|점화식/, '수열'],
      [/확률|경우의 수|조합|순열/, '확률과 통계'],
      [/로그|지수/, '지수/로그'],
      [/벡터|행렬/, '벡터/행렬'],
      [/극한|수렴|발산/, '극한'],
    ];

    for (const [pattern, topic] of topicPatterns) {
      if (pattern.test(text)) return topic;
    }
    return '일반 수학';
  }

  private extractIntent(text: string): string {
    if (/풀어|계산|구해|풀이/.test(text)) return '문제 풀이 요청';
    if (/설명|이해|뭐야|무엇|왜/.test(text)) return '개념 이해 요청';
    if (/퀴즈|문제 내|테스트|연습/.test(text)) return '퀴즈 요청';
    if (/답|맞아|틀려|확인/.test(text)) return '답안 확인 요청';
    return '일반 질문';
  }

  private extractEntities(text: string): string[] {
    const mathTerms = [
      '이차방정식', '근의 공식', '판별식', '인수분해',
      '미분', '도함수', '적분', '극값', '극대', '극소',
      '삼각함수', '사인', '코사인', '탄젠트',
      '수열', '등차수열', '등비수열', '점화식',
      '로그', '지수', '자연로그',
      '확률', '조합', '순열',
      '벡터', '행렬', '행렬식',
      '극한', '연속', '미적분',
    ];

    return mathTerms.filter(term => text.includes(term)).slice(0, 5);
  }

  private extractResult(response: string): string {
    // 정답 패턴 추출
    const answerPatterns = [
      /\*\*정답[:\s]*\*\*([^\n]+)/,
      /정답[:\s]+([^\n]+)/,
      /따라서[,\s]+([^\n]{1,80})/,
      /∴\s*([^\n]{1,80})/,
    ];

    for (const pattern of answerPatterns) {
      const match = response.match(pattern);
      if (match?.[1]) return match[1].trim().slice(0, 100);
    }

    // 정답 패턴 없으면 첫 문장 요약
    const firstSentence = response.split(/[.。\n]/)[0];
    return firstSentence?.slice(0, 100) ?? '응답 완료';
  }

  private extractKeywords(text: string): string[] {
    // 수식 기호 제거 후 의미있는 단어 추출
    const cleaned = text
      .replace(/\$[^$]+\$/g, '') // LaTeX 제거
      .replace(/[^\w가-힣\s]/g, ' ')
      .toLowerCase();

    const stopWords = new Set(['이', '가', '을', '를', '은', '는', '의', '에', '로', '으로', '와', '과', '도', '만', '에서', '그', '이것', '저것']);

    const words = cleaned
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w));

    // 빈도 기반 상위 키워드
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  }
}
