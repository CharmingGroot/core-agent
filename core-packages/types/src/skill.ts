/**
 * ISkill — 도메인 능력 단위.
 * 도구 + 프롬프트 + 룰을 하나로 묶은 캡슐.
 * .skill.md 파일로 정의되고 SkillLoader가 파싱한다.
 */
export interface ISkill {
  /** 스킬 고유 이름 (e.g., "code-review", "deploy") */
  readonly name: string;

  /** 사람이 읽을 수 있는 설명 */
  readonly description: string;

  /** 이 스킬에서 사용 가능한 도구 이름 목록 */
  readonly tools: readonly string[];

  /** 도메인 시스템 프롬프트 (LLM에 주입) */
  readonly prompt: string;

  /** 이 스킬에 적용되는 룰 이름 목록 */
  readonly rules: readonly string[];

  /** 스킬별 설정 파라미터 */
  readonly parameters: Record<string, unknown>;
}

/** .skill.md 파일의 원본 내용 */
export interface SkillFile {
  readonly filePath: string;
  readonly content: string;
}

/** 스킬 CRUD 연산 */
export interface ISkillRegistry {
  /** 스킬 등록 */
  register(skill: ISkill): void;

  /** 이름으로 스킬 조회 */
  get(name: string): ISkill | undefined;

  /** 스킬 존재 여부 */
  has(name: string): boolean;

  /** 전체 스킬 목록 */
  getAll(): readonly ISkill[];

  /** 스킬 제거 */
  unregister(name: string): boolean;
}
