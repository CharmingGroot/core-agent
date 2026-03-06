# CLI Agent Core

Claude Code와 유사한 대화형 CLI 에이전트. TypeScript 모노레포 기반, 멀티 LLM 프로바이더, Docker 샌드박스, 파일/셸 도구 지원.

## 아키텍처

```
@cli-agent/core          (타입, Registry, EventBus, RunContext, Logger, Config)
    |
    +-> @cli-agent/providers  (Claude, OpenAI wrapper)
    +-> @cli-agent/tools      (file read/write/search, shell exec)
    +-> @cli-agent/sandbox    (Docker wrapper, container pool)
    |
    +-> @cli-agent/agent      (agent loop, tool dispatcher, permission)
            |
            +-> @cli-agent/cli  (Commander + Chalk, terminal REPL)
```

## 빠른 시작

### 사전 요구사항

- **Node.js** 18.0.0 이상
- **pnpm** 8.0.0 이상 (없으면 `npm install -g pnpm`)

### 설치

```bash
# 레포지토리 클론
git clone https://github.com/CharmingGroot/core-agent.git
cd core-agent

# 의존성 설치
pnpm install
```

### 테스트 실행

```bash
# 전체 테스트 (159개)
pnpm -r test

# 패키지별 테스트
pnpm --filter @cli-agent/core test
pnpm --filter @cli-agent/providers test
pnpm --filter @cli-agent/tools test
pnpm --filter @cli-agent/sandbox test
pnpm --filter @cli-agent/agent test
pnpm --filter @cli-agent/cli test
```

### CLI 실행

#### 대화 모드 (Interactive Chat)

```bash
# Claude 사용
npx tsx packages/cli/src/bin.ts chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k YOUR_ANTHROPIC_API_KEY

# OpenAI 사용
npx tsx packages/cli/src/bin.ts chat \
  -p openai \
  -m gpt-4o \
  -k YOUR_OPENAI_API_KEY
```

#### 단일 실행 모드 (Single Run)

```bash
npx tsx packages/cli/src/bin.ts run "이 디렉토리의 파일 구조를 알려줘" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k YOUR_ANTHROPIC_API_KEY \
  -d $(pwd)
```

#### CLI 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-p, --provider <id>` | LLM 프로바이더 (claude, openai) | (필수) |
| `-m, --model <name>` | 모델명 | (필수) |
| `-k, --api-key <key>` | API 키 | (필수) |
| `-u, --base-url <url>` | API 베이스 URL | 프로바이더 기본값 |
| `--max-tokens <n>` | 최대 토큰 수 | 4096 |
| `--temperature <n>` | 온도 (0~2) | 0.7 |
| `--system-prompt <text>` | 시스템 프롬프트 | 없음 |
| `-d, --directory <path>` | 작업 디렉토리 | 현재 디렉토리 |

#### 대화 모드 명령어

| 명령 | 설명 |
|------|------|
| `/help`, `/h` | 도움말 표시 |
| `/clear` | 화면 지우기 |
| `/exit`, `/quit`, `/q` | 종료 |

### 환경 변수로 API 키 설정 (권장)

```bash
# .env 또는 셸 프로필에 추가
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# 환경변수 참조하여 실행
npx tsx packages/cli/src/bin.ts chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY
```

## 패키지 상세

### @cli-agent/core
핵심 인프라. 모든 패키지가 의존하는 기반 모듈.

- **Registry<T>**: 제네릭 레지스트리 패턴. Tool, Provider 등 플러그인 등록/조회
- **EventBus**: 타입 안전한 이벤트 시스템. agent:start, tool:end 등 이벤트 구독
- **RunContext**: 실행 컨텍스트. runId, config, eventBus, AbortController 포함
- **Config**: zod 기반 설정 검증 (AgentConfig, ProviderConfig)
- **Logger**: pino 기반 구조화 로깅
- **Errors**: 계층화된 에러 클래스 (AgentError -> RegistryError, ConfigError 등)

### @cli-agent/providers
LLM API 래퍼. Wrapper 패턴으로 외부 API 추상화.

- **ClaudeProvider**: Anthropic SDK 래핑. chat + stream 지원
- **OpenAIProvider**: OpenAI SDK 래핑. chat + stream 지원
- **ProviderFactory**: Registry 기반 팩토리. 커스텀 프로바이더 등록 가능

### @cli-agent/tools
파일/셸 도구. BaseTool 추상 클래스 기반.

- **FileReadTool**: 파일 읽기 (permission 불필요)
- **FileWriteTool**: 파일 쓰기 + 디렉토리 자동 생성 (permission 필요)
- **FileSearchTool**: fast-glob 기반 파일 검색 (permission 불필요)
- **ShellExecTool**: 셸 명령 실행 + 타임아웃 (permission 필요)

### @cli-agent/sandbox
Docker 기반 코드 실행 샌드박스.

- **DockerSandbox**: dockerode 래핑. 컨테이너 생성/실행/삭제
- **SandboxManager**: 컨테이너 풀 관리. acquire/release 패턴

### @cli-agent/agent
에이전트 루프 엔진. LLM native function calling 방식.

- **AgentLoop**: LLM call -> tool_use -> dispatch -> result -> repeat until end_turn
- **ToolDispatcher**: 도구 호출 디스패치 + 에러 핸들링
- **MessageManager**: 대화 히스토리 관리
- **PermissionManager**: 도구별 권한 체크

### @cli-agent/cli
터미널 인터페이스.

- **CLI App**: Commander 기반 chat/run 커맨드
- **CliRenderer**: EventBus 구독하여 실시간 출력 (chalk 색상)
- **InputHandler**: readline 기반 입력 처리

## 빌드

```bash
# 전체 빌드
pnpm -r build

# 패키지별 빌드
pnpm --filter @cli-agent/core build
```

## 프로젝트 구조

```
cli-agent-core/
├── packages/
│   ├── core/           # 타입, Registry, EventBus, Config, Logger, Errors
│   ├── providers/      # Claude, OpenAI LLM 래퍼
│   ├── tools/          # 파일/셸 도구
│   ├── sandbox/        # Docker 샌드박스
│   ├── agent/          # 에이전트 루프, 디스패처
│   └── cli/            # CLI 인터페이스
├── package.json        # 루트 (pnpm workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── TEST_SCENARIOS.md   # 수동 테스트 시나리오
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 언어 | TypeScript 5.4+ |
| 런타임 | Node.js 18+ |
| 패키지 관리 | pnpm workspace |
| 테스트 | vitest |
| LLM SDK | @anthropic-ai/sdk, openai |
| CLI | commander, chalk, ora |
| 설정 검증 | zod |
| 로깅 | pino |
| 컨테이너 | dockerode |
| 파일 검색 | fast-glob |
