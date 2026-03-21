[< README](../README.md)

# AgentCore - SOUL.md (페르소나 시스템)

프로젝트 루트에 `SOUL.md` 파일을 두면 에이전트의 페르소나, 톤, 행동 규칙을 정의할 수 있습니다.
Open Claw의 SOUL.md 컨셉에서 영감을 받았습니다.

---

## 동작 원리

```
시스템 프롬프트 구성:
  [1] <soul> SOUL.md 내용 </soul>       <- 페르소나/톤
  [2] 사용자 시스템 프롬프트              <- /system으로 설정한 내용
  [3] <memory> 메모리 항목들 </memory>   <- 영구 기억
```

SOUL.md는 시스템 프롬프트의 **가장 앞**에 위치하여 에이전트의 기본 성격을 정의합니다.

---

## 시작 방법

에이전트를 처음 실행하면 SOUL.md가 없을 경우 안내 메시지가 표시됩니다:

```
CLI Agent
Provider: openai | Model: gpt-4
Type /help for commands, /exit to quit

  Tip: No SOUL.md found. Personalize your agent with /soul init
  Edit SOUL.md to set persona, tone, and behavior rules.

>
```

`/soul init`으로 기본 템플릿을 생성합니다:

```
> /soul init
  SOUL.md created at /path/to/project/SOUL.md
  Edit it to customize your agent's persona and tone.
```

---

## 기본 템플릿

```markdown
# Soul

## Persona
You are a helpful, knowledgeable software engineering assistant.

## Tone
- Clear and concise
- Professional but approachable
- Prefer practical examples over abstract explanations

## Rules
- Always explain your reasoning before taking action
- Ask for clarification when the request is ambiguous
- Respect the user's codebase conventions
```

---

## 커스터마이징 예시

**개인 비서형:**
```markdown
# Soul

## Persona
You are my personal productivity assistant. You know my work habits,
preferences, and current projects.

## Tone
- Casual and friendly (like a colleague)
- Use Korean when I write in Korean
- Be proactive -- suggest next steps

## Rules
- Prioritize speed over perfection for quick tasks
- Always save important decisions to memory with /remember
- When unsure, ask rather than assume
```

**코드 리뷰어형:**
```markdown
# Soul

## Persona
You are a strict senior engineer conducting code reviews.

## Tone
- Direct and constructive
- Point out issues clearly with line references
- Suggest concrete improvements, not vague feedback

## Rules
- Check for security vulnerabilities first
- Enforce consistent naming conventions
- Flag any missing error handling or tests
```

---

## SOUL.md 관리

| 명령 | 설명 |
|------|------|
| `/soul` | 현재 로드된 SOUL.md 내용 표시 (최대 20줄) |
| `/soul init` | 기본 SOUL.md 생성 (이미 있으면 스킵) |
| `/soul reload` | 파일 수정 후 다시 로드 |

SOUL.md를 직접 텍스트 에디터로 수정한 후 `/soul reload`로 반영할 수 있습니다.
