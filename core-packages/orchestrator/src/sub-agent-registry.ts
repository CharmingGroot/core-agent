/**
 * SubAgentRegistry — Sub-Agent 등록/조회 레지스트리.
 *
 * Orchestrator가 사용할 수 있는 Sub-Agent들을 관리한다.
 * Sub-Agent는 tool description으로 변환되어 Orchestrator LLM에 전달된다.
 */
import type {
  SubAgentDescriptor,
  ToolDescriptionRef,
} from '@core/types';

const TOOL_DESCRIPTION_BASE_TOKENS = 20;
const PARAM_TOKEN_ESTIMATE = 15;

export class SubAgentRegistry {
  private readonly agents: Map<string, SubAgentDescriptor> = new Map();

  /**
   * Sub-Agent를 레지스트리에 등록한다.
   * 동일 id가 이미 존재하면 덮어쓴다.
   */
  register(descriptor: SubAgentDescriptor): void {
    this.agents.set(descriptor.id, descriptor);
  }

  /**
   * id로 Sub-Agent를 조회한다.
   */
  get(id: string): SubAgentDescriptor | undefined {
    return this.agents.get(id);
  }

  /**
   * 등록된 모든 Sub-Agent를 반환한다.
   */
  getAll(): SubAgentDescriptor[] {
    return Array.from(this.agents.values());
  }

  /**
   * id로 Sub-Agent를 제거한다.
   * @returns 제거 성공 여부
   */
  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * 등록된 Sub-Agent 수를 반환한다.
   */
  get size(): number {
    return this.agents.size;
  }

  /**
   * Sub-Agent들을 Orchestrator LLM이 이해할 수 있는
   * ToolDescriptionRef 형태로 변환한다.
   */
  toToolDescriptions(): ToolDescriptionRef[] {
    return this.getAll().map((agent) => {
      const paramRefs = agent.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
      }));

      const tokenEstimate =
        TOOL_DESCRIPTION_BASE_TOKENS +
        paramRefs.length * PARAM_TOKEN_ESTIMATE;

      return {
        name: agent.id,
        description: agent.description,
        parameters: paramRefs,
        tokenEstimate,
      };
    });
  }
}
