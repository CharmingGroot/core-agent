[< README](../README.md)

# AgentCore - 패키지 상세

---

## @cli-agent/core (56 tests)

모든 패키지가 의존하는 핵심 인프라.

| 모듈 | 설명 |
|------|------|
| `Registry<T>` | 제네릭 레지스트리. `register(name, item)`, `get(name)`, `tryGet(name)`, `has(name)`, `getAll()` |
| `EventBus` | 타입 안전 이벤트 시스템. `on(event, handler)`, `emit(event, data)`, `once()` |
| `RunContext` | 실행 컨텍스트. `runId`, `config`, `eventBus`, `AbortController`, `metadata` 포함 |
| `Config` | zod 스키마 기반 설정 검증. `providerConfigSchema`, `agentConfigSchema` |
| `Logger` | pino 기반 구조화 로깅. `createChildLogger(name)` |
| `Errors` | 계층화된 에러 클래스. `AgentError` -> `RegistryError`, `ConfigError`, `ProviderError`, `ToolExecutionError`, `SandboxError`, `PermissionDeniedError`, `AbortError` |

---

## @cli-agent/providers (32 tests)

LLM API 래퍼. Wrapper 패턴으로 외부 SDK 추상화.

| 모듈 | 설명 |
|------|------|
| `BaseProvider` | 추상 클래스. `ILlmProvider` 인터페이스 구현 |
| `ClaudeProvider` | `@anthropic-ai/sdk` 래핑. `chat()` + `stream()` 지원 |
| `OpenAIProvider` | `openai` SDK 래핑. `chat()` + `stream()` 지원 |
| `ProviderFactory` | Registry 기반 팩토리. `createProvider(config)` |
| `resolveAuth()` | 7가지 인증 타입 리졸버 (no-auth, api-key, oauth, azure-ad, aws-iam, gcp, credential-file) |
| `extractToken()` | AuthConfig에서 동기적으로 토큰 추출 |

---

## @cli-agent/tools (24 tests)

파일/셸 도구. `BaseTool` 추상 클래스 기반.

| 도구 | 권한 | 설명 |
|------|------|------|
| `file_read` | 불필요 | 파일 읽기 |
| `file_write` | **필요** | 파일 쓰기 + 디렉토리 자동 생성 |
| `file_search` | 불필요 | fast-glob 기반 파일 패턴 검색 (최대 100개) |
| `shell_exec` | **필요** | 셸 명령 실행 + 타임아웃(30초) + 출력 제한(100KB) |

---

## @cli-agent/sandbox (11 tests)

Docker 기반 코드 격리 실행 환경.

| 모듈 | 설명 |
|------|------|
| `DockerSandbox` | `dockerode` 래핑. 컨테이너 생성 -> 코드 실행 -> 결과 수집 -> 삭제 |
| `SandboxManager` | 컨테이너 풀 관리. `acquire()` -> 사용 -> `release()`. 풀 고갈 시 자동 생성 |

지원 언어: JavaScript, TypeScript, Python, Bash, sh

---

## @cli-agent/agent (32 tests)

에이전트 루프 엔진. LLM <-> Tool 반복 실행의 핵심.

| 모듈 | 설명 |
|------|------|
| `AgentLoop` | 메인 루프. LLM 호출 -> tool_use 판단 -> 도구 실행 -> 결과 피드백 -> 반복 |
| `ToolDispatcher` | 도구 호출 디스패치. Registry 조회 -> 권한 체크 -> 실행 -> 이벤트 발행 |
| `MessageManager` | 대화 히스토리 관리. system/user/assistant/tool_result 메시지 관리 |
| `PermissionManager` | 도구별 권한 체크. `requiresPermission: true`인 도구는 핸들러로 승인 요청 |

---

## @cli-agent/cli (45 tests)

터미널 인터페이스 + 메모리 + 페르소나.

| 모듈 | 설명 |
|------|------|
| `createCliApp()` | Commander 기반 `chat`/`run` 커맨드 정의 |
| `CliRenderer` | EventBus 구독 -> 박스 스타일 도구 출력, 토큰 트래킹, 접힘 표시 |
| `InputHandler` | readline 기반 REPL 입력. 18개 슬래시 커맨드 파싱 |
| `MemoryManager` | `.cli-agent/MEMORY.md` 영구 메모리. 세션 간 기억 유지 |
| `SoulLoader` | `SOUL.md` 페르소나 로더. 시스템 프롬프트 앞에 `<soul>` 블록 주입 |

---

## @cli-agent/ui (39 tests)

Electron UI (선택적).

| 모듈 | 설명 |
|------|------|
| `main/` | Electron 메인 프로세스 |
| `renderer/` | React 렌더러 |
