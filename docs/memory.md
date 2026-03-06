[< README](../README.md)

# Chamelion - 메모리 시스템

에이전트는 세션 간 지속되는 메모리를 지원합니다.
프로젝트 디렉토리의 `.cli-agent/MEMORY.md`에 마크다운 형태로 저장됩니다.

---

## 동작 원리

```
.cli-agent/
└── MEMORY.md     <- 영구 메모리 파일
```

메모리 항목은 시스템 프롬프트의 `<memory>` 블록으로 LLM에 전달됩니다:

```xml
<memory>
The following facts have been remembered across sessions:
- 이 프로젝트는 pnpm workspace를 사용한다
- 사용자는 한국어를 선호한다
- TypeScript strict mode 활성화됨
</memory>
```

---

## 사용법

```
> /remember 이 프로젝트는 vitest로 테스트한다
  Remembered: "이 프로젝트는 vitest로 테스트한다"

> /remember 배포는 AWS ECS를 사용
  Remembered: "배포는 AWS ECS를 사용"

> /memory
  Memory (2 entries):
  - 이 프로젝트는 vitest로 테스트한다
  - 배포는 AWS ECS를 사용

> /forget vitest
  Removed 1 matching entries.

> /forget all
  All memories cleared.
```

---

## 특성

- 중복 항목 자동 방지
- 빈 문자열 저장 불가
- 키워드 기반 삭제 (대소문자 무시)
- `/exit` 시 자동 저장
- 마크다운 형태로 사람이 직접 편집 가능

---

## MEMORY.md 파일 형식

```markdown
# Memory

- 이 프로젝트는 pnpm workspace를 사용한다
- 사용자는 한국어를 선호한다
- TypeScript strict mode 활성화됨
```
