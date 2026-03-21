[< README](../README.md)

# AgentCore - 아키텍처

---

## 아키텍처 개요

TypeScript 모노레포(pnpm workspace) 기반, 6개 패키지로 구성됩니다.

```
@cli-agent/core          타입 정의, Registry, EventBus, RunContext, Logger, Config, Errors
    │
    ├── @cli-agent/providers  LLM API 래퍼 (Claude, OpenAI, vLLM, Ollama, Custom) + 인증 리졸버
    ├── @cli-agent/tools      파일/셸 도구 (file_read, file_write, file_search, shell_exec)
    ├── @cli-agent/sandbox    Docker 샌드박스 (코드 격리 실행)
    │
    └── @cli-agent/agent      에이전트 루프 엔진 (LLM <-> Tool 반복 실행)
            │
            └── @cli-agent/cli  터미널 인터페이스 (Commander + Chalk REPL)
```

### 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Registry 패턴** | 도구, 프로바이더 등 모든 플러그인은 `Registry<T>`에 등록. 직접 import 없이 이름으로 조회 |
| **Wrapper 패턴** | 외부 API(Anthropic, OpenAI)는 BaseProvider로 추상화. 내부 코드는 인터페이스만 의존 |
| **Event-Driven** | 모듈 간 통신은 `EventBus`로 수행. 렌더러는 이벤트 구독만으로 UI 구성 |
| **Native Function Calling** | 텍스트 파싱(ReAct) 방식이 아닌 LLM의 native tool_use 기능 사용 |

---

## 내부 동작 프로세스

사용자가 메시지를 입력하면 내부적으로 다음 프로세스가 실행됩니다.

### 전체 흐름도

```
사용자 입력: "현재 디렉토리의 파일을 보여줘"
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. InputHandler                                                │
│     사용자 입력 수신 -> AgentLoop.run(message) 호출              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. AgentLoop (반복 루프)                                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 2-1. MessageManager                                      │   │
│  │      대화 히스토리에 사용자 메시지 추가                   │   │
│  │      [system, user, assistant, tool_result, ...]         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 2-2. LLM Provider (Claude / OpenAI)                      │   │
│  │      전체 대화 히스토리 + 도구 목록 전송                  │   │
│  │      -> LLM이 응답 생성                                   │   │
│  │                                                          │   │
│  │      응답 타입:                                          │   │
│  │        - stopReason: "end_turn" -> 최종 응답 (루프 종료)  │   │
│  │        - stopReason: "tool_use" -> 도구 호출 요청         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│              stopReason === "tool_use" 인 경우                   │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 2-3. ToolDispatcher                                      │   │
│  │      toolCalls 배열을 순회하며 각 도구 실행               │   │
│  │                                                          │   │
│  │      (1) Registry에서 도구 조회 (이름 기반)                │   │
│  │      (2) PermissionManager: 권한 확인 (requiresPermission) │   │
│  │      (3) JSON.parse(toolCall.arguments) -> 파라미터 추출    │   │
│  │      (4) tool.execute(params, context) 실행                │   │
│  │      (5) 결과를 MessageManager에 tool_result로 추가        │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│           다시 2-2로 돌아감 (LLM에 도구 결과 전달)              │
│           -> LLM이 결과를 보고 최종 응답 또는 추가 도구 호출     │
│                                                                 │
│  루프 종료 조건:                                                │
│    - stopReason === "end_turn" (LLM이 최종 응답)                │
│    - iterations >= maxIterations (반복 횟수 초과)               │
│    - context.isAborted (사용자 중단)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. CliRenderer                                                 │
│     EventBus 이벤트를 구독하여 실시간으로 터미널에 출력         │
│     -> 도구 실행 박스, 토큰 사용량, 반복 횟수 등 표시           │
└─────────────────────────────────────────────────────────────────┘
```

---

### 구체적 예시: "src 폴더의 .ts 파일 목록을 보여줘"

```
[1단계] 사용자 -> AgentLoop
  MessageManager에 추가:
    { role: "user", content: "src 폴더의 .ts 파일 목록을 보여줘" }

[2단계] AgentLoop -> LLM (iteration 1)
  LLM에 전송하는 메시지:
    messages: [{ role: "user", content: "src 폴더의 ..." }]
    tools: [
      { name: "file_read",   description: "파일 읽기", params: [...] },
      { name: "file_write",  description: "파일 쓰기", params: [...] },
      { name: "file_search", description: "파일 검색", params: [...] },
      { name: "shell_exec",  description: "셸 명령",   params: [...] }
    ]

  LLM 응답:
    {
      content: "파일 목록을 검색하겠습니다.",
      stopReason: "tool_use",
      toolCalls: [{
        id: "tc-abc123",
        name: "file_search",
        arguments: '{"pattern": "src/**/*.ts"}'
      }]
    }

[3단계] ToolDispatcher -> file_search 실행
  (1) Registry.get("file_search") -> FileSearchTool 인스턴스
  (2) requiresPermission: false -> 권한 체크 스킵
  (3) JSON.parse('{"pattern": "src/**/*.ts"}')
  (4) fast-glob으로 패턴 매칭 실행
  (5) 결과: { success: true, output: "src/index.ts\nsrc/config.ts\n..." }

[4단계] AgentLoop -> LLM (iteration 2)
  MessageManager에 추가된 전체 히스토리:
    [
      { role: "user", content: "src 폴더의 ..." },
      { role: "assistant", content: "파일 목록을 검색하겠습니다.",
        toolCalls: [{ id: "tc-abc123", name: "file_search", ... }] },
      { role: "tool_result", toolCallId: "tc-abc123",
        content: "src/index.ts\nsrc/config.ts\n..." }
    ]

  LLM 응답:
    {
      content: "src 폴더에 다음 TypeScript 파일이 있습니다:\n- src/index.ts\n- ...",
      stopReason: "end_turn",    <- 루프 종료
      toolCalls: []
    }

[5단계] 결과 반환 -> CliRenderer로 출력
```

---

## LLM 메시지 변환 (Provider별)

LLM에 보내는 메시지는 프로바이더마다 포맷이 다릅니다:

### Claude (Anthropic)

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "system": "You are a helpful assistant.",
  "messages": [
    { "role": "user", "content": "파일 목록 보여줘" },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "검색하겠습니다." },
        { "type": "tool_use", "id": "tc-1", "name": "file_search",
          "input": { "pattern": "**/*.ts" } }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "tool_result", "tool_use_id": "tc-1",
          "content": "index.ts\nconfig.ts" }
      ]
    }
  ],
  "tools": [
    {
      "name": "file_search",
      "description": "Search for files matching a glob pattern",
      "input_schema": {
        "type": "object",
        "properties": { "pattern": { "type": "string", "description": "..." } },
        "required": ["pattern"]
      }
    }
  ]
}
```

### OpenAI

```json
{
  "model": "gpt-4",
  "max_tokens": 4096,
  "messages": [
    { "role": "user", "content": "파일 목록 보여줘" },
    {
      "role": "assistant",
      "content": "검색하겠습니다.",
      "tool_calls": [
        { "id": "tc-1", "type": "function",
          "function": { "name": "file_search", "arguments": "{\"pattern\":\"**/*.ts\"}" } }
      ]
    },
    { "role": "tool", "tool_call_id": "tc-1", "content": "index.ts\nconfig.ts" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "file_search",
        "description": "Search for files matching a glob pattern",
        "parameters": {
          "type": "object",
          "properties": { "pattern": { "type": "string", "description": "..." } },
          "required": ["pattern"]
        }
      }
    }
  ]
}
```
