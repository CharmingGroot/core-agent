/**
 * TaskPlanner — Goal 분해 엔진.
 *
 * 사용자 목표(goal)를 Sub-Agent에 매핑 가능한 태스크로 분해한다.
 * 현재는 키워드 매칭 기반 휴리스틱 방식이며,
 * 추후 LLM 기반 분해로 교체 예정.
 */
import type {
  SubAgentDescriptor,
  TaskPlan,
  PlannedTask,
} from '@core/types';
import { randomUUID } from 'node:crypto';

const MIN_KEYWORD_LENGTH = 3;

/**
 * 문장을 소문자 키워드 배열로 변환한다.
 * 3글자 미만 키워드는 무시한다.
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= MIN_KEYWORD_LENGTH);
}

/**
 * 두 키워드 배열 간 매칭 점수를 계산한다.
 * 겹치는 키워드 수를 반환한다.
 */
function computeMatchScore(
  goalKeywords: string[],
  agentKeywords: string[],
): number {
  let score = 0;
  for (const kw of goalKeywords) {
    if (agentKeywords.includes(kw)) {
      score += 1;
    }
  }
  return score;
}

interface AgentMatch {
  readonly agent: SubAgentDescriptor;
  readonly score: number;
  readonly matchedKeywords: string[];
}

export class TaskPlanner {
  /**
   * Goal을 분석하여 TaskPlan을 생성한다.
   *
   * 1. Goal에서 키워드를 추출
   * 2. 각 Sub-Agent description과 키워드 매칭
   * 3. 매칭 점수 > 0인 에이전트에 대해 태스크 생성
   * 4. 매칭이 없으면 첫 번째 에이전트에 단일 태스크 생성
   */
  decompose(
    goal: string,
    availableAgents: SubAgentDescriptor[],
  ): TaskPlan {
    if (availableAgents.length === 0) {
      return this.createEmptyPlan(goal);
    }

    const goalKeywords = extractKeywords(goal);
    const matches = this.findMatches(goalKeywords, availableAgents);

    const tasks: PlannedTask[] =
      matches.length > 0
        ? this.createTasksFromMatches(goal, matches)
        : this.createFallbackTask(goal, availableAgents[0]);

    return {
      goalId: randomUUID(),
      originalGoal: goal,
      tasks,
      createdAt: new Date(),
    };
  }

  private findMatches(
    goalKeywords: string[],
    agents: SubAgentDescriptor[],
  ): AgentMatch[] {
    const matches: AgentMatch[] = [];

    for (const agent of agents) {
      const agentKeywords = extractKeywords(
        `${agent.description} ${agent.skillName}`,
      );
      const score = computeMatchScore(goalKeywords, agentKeywords);

      if (score > 0) {
        const matchedKeywords = goalKeywords.filter((kw) =>
          agentKeywords.includes(kw),
        );
        matches.push({ agent, score, matchedKeywords });
      }
    }

    // 점수 내림차순 정렬
    return matches.sort((a, b) => b.score - a.score);
  }

  private createTasksFromMatches(
    goal: string,
    matches: AgentMatch[],
  ): PlannedTask[] {
    const previousTaskIds: string[] = [];

    return matches.map((match) => {
      const taskId = randomUUID();
      const task: PlannedTask = {
        taskId,
        description: `${goal} (via ${match.agent.id}, matched: ${match.matchedKeywords.join(', ')})`,
        agentId: match.agent.id,
        skillName: match.agent.skillName,
        params: {},
        dependsOn: [...previousTaskIds],
        status: 'pending',
      };
      previousTaskIds.push(taskId);
      return task;
    });
  }

  private createFallbackTask(
    goal: string,
    fallbackAgent: SubAgentDescriptor,
  ): PlannedTask[] {
    return [
      {
        taskId: randomUUID(),
        description: `${goal} (fallback to ${fallbackAgent.id})`,
        agentId: fallbackAgent.id,
        skillName: fallbackAgent.skillName,
        params: {},
        dependsOn: [],
        status: 'pending',
      },
    ];
  }

  private createEmptyPlan(goal: string): TaskPlan {
    return {
      goalId: randomUUID(),
      originalGoal: goal,
      tasks: [],
      createdAt: new Date(),
    };
  }
}
