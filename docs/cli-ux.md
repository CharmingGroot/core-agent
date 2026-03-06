[< README](../README.md)

# Chamelion - CLI 렌더링 UX

Claude Code와 유사한 리치 터미널 UX를 제공합니다.

---

## 실행 예시 출력

```
CLI Agent
Type /help for commands, /exit to quit

> 현재 디렉토리의 파일 구조를 알려줘

────────────────────────────────────────────────────────────────────
  Run: a1b2c3d4...
────────────────────────────────────────────────────────────────────

  [1] Thinking...
  [1] 1 tool call(s) (150+25 tokens)

+ shell_exec ─────────────────────────────────────────────────────+
| command: ls -la                                                  |
| success (42ms)                                                   |
|   total 96                                                       |
|   drwxr-xr-x  12 user  staff  384 Mar  7 00:00 .                |
|   drwxr-xr-x   5 user  staff  160 Mar  6 23:00 ..               |
|   -rw-r--r--   1 user  staff  245 Mar  7 00:00 package.json      |
|   drwxr-xr-x  10 user  staff  320 Mar  7 00:00 packages          |
|   ... +3 lines                                                   |
+──────────────────────────────────────────────────────────────────+

  [2] Thinking...
  [2] Response ready (180+85 tokens)

현재 디렉토리의 구조는 다음과 같습니다:
- package.json -- 루트 패키지 설정
- packages/ -- 모노레포 패키지 디렉토리
  - core/, providers/, tools/, sandbox/, agent/, cli/
...

────────────────────────────────────────────────────────────────────
  completed | 2 iteration(s) | tokens: 330 in / 110 out
────────────────────────────────────────────────────────────────────

>
```

---

## UX 요소 설명

| 요소 | 설명 |
|------|------|
| `Run: a1b2c3d4...` | 고유 실행 ID (RunContext.runId) |
| `[N] Thinking...` | N번째 LLM 호출 중 |
| `[N] 1 tool call(s)` | LLM이 도구 호출을 결정함 |
| `+ tool_name --+` | 도구 실행 박스 (노란색 테두리) |
| `command: ls -la` | 도구에 전달된 파라미터 |
| `success (42ms)` | 실행 결과 + 소요 시간 |
| `... +3 lines` | 출력이 5줄 초과 시 접힘 표시 |
| `+──────────────+` | 도구 실행 박스 닫힘 (성공: 초록, 실패: 빨강) |
| `tokens: 330 in / 110 out` | 총 토큰 사용량 |
| `2 iteration(s)` | 총 LLM 호출 횟수 |

---

# 슬래시 커맨드 (라이브 설정)

대화 중 슬래시 커맨드로 모델, 프로바이더, 온도 등을 실시간 변경할 수 있습니다.
설정 변경 시 AgentLoop이 자동으로 재생성됩니다 (대화 히스토리는 초기화).

---

## 전체 명령어

| 명령 | 설명 | 예시 |
|------|------|------|
| `/help`, `/h` | 도움말 표시 | |
| `/clear` | 화면 지우기 | |
| `/exit`, `/quit`, `/q` | 메모리 저장 후 종료 | |
| `/config` | 현재 설정 전체 표시 | |
| `/model <name>` | 모델 변경 | `/model gpt-4o` |
| `/provider <id>` | 프로바이더 변경 | `/provider vllm` |
| `/temperature <n>` | 온도 변경 (0~2) | `/temp 0.3` |
| `/tokens <n>` | 최대 토큰 수 변경 | `/tokens 8192` |
| `/system <text>` | 시스템 프롬프트 변경 | `/system 한국어로 답변해주세요` |
| `/memory`, `/mem` | 저장된 메모리 목록 | |
| `/remember <text>` | 메모리에 사실 저장 | `/remember 이 프로젝트는 pnpm 사용` |
| `/forget <keyword>` | 키워드 매칭 메모리 삭제 | `/forget pnpm` |
| `/forget all` | 전체 메모리 초기화 | |
| `/compact` | 대화 초기화 (메모리 유지) | |
| `/soul` | 현재 SOUL.md 표시 | |
| `/soul init` | 기본 SOUL.md 생성 | |
| `/soul reload` | SOUL.md 디스크에서 재로드 | |

---

## 사용 예시

```
> /config
  Current Configuration:
  -────────────────────────────
  Provider:     openai
  Model:        gpt-4
  Max Tokens:   4096
  Temperature:  0.7
  Soul:         loaded
  Memory:       3 entries

> /model gpt-4o
  Model changed to: gpt-4o

> /temperature 0.2
  Temperature changed to: 0.2

> /provider vllm
  Provider changed to: vllm
```
