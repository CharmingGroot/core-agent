# AgentCore

**TypeScript AI 에이전트 프레임워크 — 어디서든, 어떤 모델이든, 당신의 방식대로.**

멀티 LLM 지원, MCP 도구 통합, 거버넌스, 컨텍스트 엔진을 모듈로 조합하는
경량 AI 에이전트 프레임워크.

---

## 왜 AgentCore를 만들었나

### 소형 모델도 실패하지 않는 Tool Calling

모든 도구 파라미터가 primitive type (string, number, boolean)이다.
LLM에게 복잡한 객체나 배열 생성을 요구하지 않는다.
30B급 로컬 모델도 안정적으로 도구를 호출할 수 있다.

```json
{ "path": "src/main.ts" }
{ "command": "npm test" }
{ "task": "버그를 찾아서 수정해줘" }
```

### 프레임워크가 아닌 라이브러리

LangChain처럼 추상화 위에 추상화를 쌓지 않는다.
LLM에게 전달되는 messages, tools, system prompt를 개발자가 직접 보고 제어한다.
블랙박스가 없으므로 디버깅이 쉽고, 원하는 부분만 골라 쓸 수 있다.

### 멀티턴 에이전트 루프 — 단순하고 투명한

```
while (iterations < max) {
  response = LLM.chat(messages, tools)
  if (no tool calls) → 완료
  execute tools → 결과를 messages에 추가 → 반복
}
```

별도의 planner, state machine, ReAct 파서가 없다.
컨텍스트 윈도우 자체가 작업 기억이고, LLM이 스스로 다음 행동을 판단한다.

---

## 어디에도 묶이지 않는다

### 벤더

**모든** LLM 백엔드와 동작한다. Claude, OpenAI, vLLM, Ollama, 또는 어떤
OpenAI 호환 서버든. 런타임에 슬래시 커맨드 하나로 프로바이더를 전환할 수 있다
— 코드 변경도, 재배포도 필요 없다.

### 환경

**CLI**, **Electron 데스크톱 앱**, **Kubernetes** 안에서 실행된다.
코드 실행은 Docker 샌드박스에서 격리된다. 같은 코드베이스, 같은 패키지,
어떤 환경이든.

### 도구

내장 도구(file, shell)는 시작 시 등록되고, **MCP 외부 도구**는 런타임에
동적으로 연결/해제된다. stdio와 SSE 트랜스포트 모두 지원.
재시작 없이 MCP 서버를 추가하면 도구가 자동으로 발견되어 등록된다.

### 거버넌스

`IPolicyProvider` 패턴으로 정책과 로직을 분리한다:

| 모드 | 프로필 | 도구 접근 | 승인 |
|------|--------|----------|------|
| **Standalone** | 없음 (OpenPolicy) | 모든 도구 허용 | 없음 |
| **Governed** | 관리자 할당 | 프로필 기반 필터링 | 프로필 정책에 따라 |

- **Standalone** — 개인 개발자용. 제로 설정, DB 불필요. 몇 분 만에 배포.
- **Governed** — 팀/조직용. 프로필로 도구 접근 제어, 엔터프라이즈 RBAC,
  멀티 DB (PostgreSQL, MySQL/MariaDB, MongoDB), 감사 추적, 승인 워크플로우.

거버넌스 요구사항이 바뀌어도 에이전트 코드는 바뀌지 않는다.

---

## 아키텍처 개요

2계층 모노레포. Layer 1은 에이전트 런타임, Layer 2는
오케스트레이션 및 거버넌스 플레인.

```
Layer 2: @core/* (오케스트레이션)
┌──────────┬────────────────┬─────────┬──────┬──────────────┬────────────┬─────────┐
│  types   │ context-engine │  skill  │ rule │ orchestrator │ governance │ harness │
└──────────┴───────┬────────┴────┬────┴──┬───┴──────┬───────┴─────┬──────┴────┬────┘
                   │             │       │          │             │           │
Layer 1: @cli-agent/* (에이전트 런타임)
┌──────────┬────────────┬─────────┬─────────┬─────────┬──────────────────┐
│   core   │  providers │  tools  │ sandbox │  agent  │  cli / electron  │
└──────────┴────────────┴─────────┴─────────┴─────────┴──────────────────┘
```

**Layer 1 -- `@cli-agent/*` (6개 패키지)**

| 패키지 | 역할 |
|---------|------|
| `core` | 타입, Registry, EventBus, RunContext, Config (zod), Logger, Errors |
| `providers` | LLM 래퍼 (Claude, OpenAI, vLLM, Ollama, Custom) + 인증 리졸버 |
| `tools` | 내장 도구 + MCP 클라이언트 (stdio/SSE), 성찰 도구 |
| `sandbox` | Docker 기반 코드 격리 실행 (JS, TS, Python, Bash) |
| `agent` | 에이전트 루프 엔진 -- LLM <-> Tool 디스패치 사이클 |
| `cli` / `ui` | 터미널 REPL (Commander + Chalk) 및 Electron 데스크톱 UI |

**Layer 2 -- `@core/*` (7개 패키지)**

| 패키지 | 역할 |
|---------|------|
| `types` | 공유 타입 + `IPolicyProvider` + Profile 정의 |
| `context-engine` | 토큰 버짓 추적, 히스토리 압축, 스킬/프로필 기반 도구 필터링 |
| `skill` | 스킬 정의, 로딩, 레지스트리 |
| `rule` | 룰 엔진 (내장 룰 + 거버넌스 전용 룰) |
| `orchestrator` | DAG 기반 병렬 파이프라인 실행 엔진 |
| `governance` | RBAC, 감사, 멀티 DB (OpenPolicy / GovernedPolicy) |
| `harness` | 도메인 조합 루트 -- 프로필, 스킬, 룰, 에이전트, 정책을 조립 |

---

## 도구 시스템

### 내장 도구

앱 시작 시 자동 등록:

| 도구 | 설명 |
|------|------|
| `file_read` | 파일 읽기 |
| `file_write` | 파일 쓰기 (디렉토리 자동 생성) |
| `file_edit` | 검색-치환 기반 파일 편집 (유일성 검증) |
| `file_search` | 파일 검색 (glob 패턴) |
| `content_search` | 파일 내용 검색 (정규식, grep 유사) |
| `shell_exec` | 셸 명령 실행 |
| `reflect` | 스킬 지침 대비 자기 성찰 |

각 도구에는 `.skill.md` 가이드라인이 포함되어 있어 LLM의 도구 사용 품질을 높인다.

### MCP 외부 도구

런타임에 MCP 서버를 연결하면 도구가 자동 발견/등록된다:

```typescript
// stdio 트랜스포트 (자식 프로세스)
await mcpManager.connect({
  name: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
});

// SSE 트랜스포트 (HTTP)
await mcpManager.connect({
  name: 'database',
  transport: 'sse',
  url: 'http://localhost:3001',
});

// 런타임 해제 (재시작 불필요)
await mcpManager.disconnect('github');
```

MCP 도구는 `서버명__도구명` 형식으로 Registry에 등록된다 (예: `github__create_issue`).

---

## 프로필 기반 접근 제어

Governed 모드에서 관리자가 프로필을 정의하고 사용자에게 할당한다.
프로필은 LLM에 전달되는 도구 자체를 필터링하므로, 차단된 도구는
LLM에게 보이지도 않는다.

```
Profile "backend-dev"
  ├── allowedTools: ["file_*", "shell_exec", "github__*"]
  ├── deniedTools: ["github__delete_repo"]
  ├── approvalRequired: ["shell_exec"]
  └── allowedSkills: ["code-edit", "code-review"]

Profile "data-analyst"
  ├── allowedTools: ["file_read", "file_search", "db__*"]
  ├── deniedTools: ["db__drop_table"]
  └── approvalRequired: ["db__query"]
```

적용 시점:

```
Harness → 프로필 로드 → 도구 필터링 → LLM에 허용된 도구만 전달
```

Standalone 모드에서는 프로필 없이 모든 도구가 허용된다.

---

## 핵심 패턴

- **Registry** -- 모든 플러그인 가능 컴포넌트는 이름으로 등록; 모듈 간 직접 import 금지.
- **Wrapper** -- 외부 API (Anthropic SDK, OpenAI SDK, Docker)는 인터페이스 뒤에서 추상화.
- **Event-Driven** -- 모듈은 `EventBus`로 통신; 렌더러는 이벤트를 구독.
- **Native Function Calling** -- LLM 네이티브 `tool_use` 사용, 텍스트 파싱 ReAct 체인 아님.
- **Agent-as-Tool** -- 에이전트가 다른 에이전트를 도구로 호출하여 계층적 태스크 분해 가능.
- **IPolicyProvider** -- 거버넌스는 주입, 하드코딩 아님. OpenPolicy → GovernedPolicy 교체 시 에이전트 코드 수정 없음.
- **Profile** -- Governed 모드에서 도구 접근을 앞단에서 필터링. LLM이 못 쓰는 도구를 호출하려고 토큰 낭비하지 않음.
- **MCP** -- 외부 도구 서버를 런타임에 연결/해제. stdio + SSE 트랜스포트 지원.

---

## 빠른 시작

> 전체 가이드: `docs/getting-started.md`

```bash
# 설치 및 빌드
pnpm install && pnpm build

# Claude
node packages/cli/dist/bin.js chat \
  -p claude -m claude-sonnet-4-6 -k $ANTHROPIC_API_KEY

# OpenAI
node packages/cli/dist/bin.js chat \
  -p openai -m gpt-4o -k $OPENAI_API_KEY

# vLLM (셀프 호스팅, 인증 없음)
node packages/cli/dist/bin.js chat \
  -p vllm -m meta-llama/Llama-3.1-70B-Instruct \
  -k no-auth -u http://gpu-server:8000/v1

# Ollama (로컬)
node packages/cli/dist/bin.js chat \
  -p ollama -m llama3.1:70b \
  -k no-auth -u http://localhost:11434/v1
```

대화 중 프로바이더 실시간 전환:

```
> /provider vllm
> /model meta-llama/Llama-3.1-70B-Instruct
```

---

## 패키지 레시피 (목적별 조합법)

모든 패키지를 쓸 필요 없다. 목적에 맞는 패키지만 골라서 조합한다.

### 의존성 맵

```
@core/types             ← 의존성 0 (순수 타입)
@cli-agent/core         ← 외부: zod, pino
    │
    ├── @cli-agent/providers       ← + anthropic-sdk, openai
    ├── @cli-agent/tools           ← + fast-glob
    ├── @cli-agent/external-tools  ← (없음)
    ├── @cli-agent/sandbox         ← + dockerode
    ├── @core/skill                ← (없음)
    ├── @core/rule                 ← (없음)
    ├── @core/context-engine       ← (없음)
    ├── @core/orchestrator         ← (없음)
    └── @core/governance           ← peer: pg, mysql2, mongodb
            │
            ├── @cli-agent/agent   ← core + providers
            └── @core/harness      ← 7개 결합 (오케스트레이터)
```

아래 화살표(`→`)는 "이것만 import하면 된다"를 의미한다.

---

### 레시피 1: LLM API 래퍼만 쓰고 싶다

> "Claude/OpenAI API를 직접 호출하되, 인증·리트라이·스트리밍을 프레임워크에 맡기고 싶다."

```
필요 패키지: @cli-agent/core + @cli-agent/providers
외부 의존성: zod, pino, @anthropic-ai/sdk 또는 openai
```

```typescript
import { parseAgentConfig } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';

const config = parseAgentConfig({
  provider: {
    providerId: 'claude',
    model: 'claude-sonnet-4-6',
    auth: { type: 'api-key', apiKey: process.env.ANTHROPIC_API_KEY },
  },
});

const provider = createProvider(config.provider);

// 단순 채팅
const response = await provider.chat([
  { role: 'user', content: '한국의 수도는?' },
]);
console.log(response.content);

// 스트리밍
for await (const event of provider.stream([
  { role: 'user', content: '긴 에세이를 써줘' },
])) {
  if (event.type === 'text_delta') process.stdout.write(event.content ?? '');
}
```

**이 레시피에서 사용하지 않는 것:** tools, agent, external-tools, sandbox, core-packages 전부.

---

### 레시피 2: 에이전트 루프 (도구 포함)

> "LLM이 도구를 호출하고, 결과를 보고, 다시 판단하는 자율 루프를 돌리고 싶다."

```
필요 패키지: @cli-agent/core + @cli-agent/providers + @cli-agent/agent
선택 패키지: @cli-agent/tools (내장 도구) 또는 직접 구현
외부 의존성: zod, pino, LLM SDK, (fast-glob)
```

```typescript
import { Registry, EventBus } from '@cli-agent/core';
import type { ITool } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { AgentLoop } from '@cli-agent/agent';

// 방법 A: 내장 도구 사용
import { createToolRegistry } from '@cli-agent/tools';
const toolRegistry = createToolRegistry();

// 방법 B: 커스텀 도구만 사용 (tools 패키지 불필요)
const customRegistry = new Registry<ITool>();
customRegistry.register('my_tool', myCustomTool);

const agent = new AgentLoop({
  provider: createProvider(providerConfig),
  toolRegistry,  // A 또는 B
  config: agentConfig,
  eventBus: new EventBus(),
  streaming: true,
});

const result = await agent.run('src 디렉토리의 파일 목록을 보여줘');
console.log(result.content);
```

**핵심:** `@cli-agent/agent`는 `ITool` 인터페이스만 알면 된다. 도구 구현체가 무엇이든 상관없다.

---

### 레시피 3: 커스텀 도구 작성

> "내 비즈니스 로직을 도구로 만들어서 에이전트에게 제공하고 싶다."

```
필요 패키지: @cli-agent/core (ITool 인터페이스만)
선택 패키지: @cli-agent/tools (BaseTool 헬퍼 클래스 사용 시)
```

```typescript
// 방법 A: ITool 직접 구현 (의존성 최소)
import type { ITool, ToolDescription, ToolResult, JsonObject, RunContext } from '@cli-agent/core';

const dbQueryTool: ITool = {
  name: 'db_query',
  requiresPermission: true,
  describe(): ToolDescription {
    return {
      name: 'db_query',
      description: 'Execute a read-only SQL query',
      parameters: [
        { name: 'sql', type: 'string', description: 'SQL query', required: true },
      ],
    };
  },
  async execute(params: JsonObject, context: RunContext): Promise<ToolResult> {
    const sql = params['sql'] as string;
    const rows = await db.query(sql);
    return { success: true, output: JSON.stringify(rows) };
  },
};

// 방법 B: BaseTool 확장 (헬퍼 메서드 활용)
import { BaseTool } from '@cli-agent/tools';

class DbQueryTool extends BaseTool {
  readonly name = 'db_query';
  readonly requiresPermission = true;

  describe() {
    return {
      name: this.name,
      description: 'Execute a read-only SQL query',
      parameters: [
        this.createParam('sql', 'string', 'SQL query', true),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext) {
    const sql = params['sql'] as string;
    // resolveSafePath() 등 BaseTool 보안 헬퍼 사용 가능
    const rows = await db.query(sql);
    return this.success(JSON.stringify(rows));
  }
}
```

**방법 A**는 `@cli-agent/core`만 의존. **방법 B**는 `@cli-agent/tools`도 의존하지만 `resolveSafePath()`, `success()`, `failure()` 등 헬퍼를 얻는다.

---

### 레시피 4: MCP 서버 연결만

> "이미 MCP 서버가 있다. 에이전트 루프 없이 MCP 도구만 Registry에 등록해서 쓰고 싶다."

```
필요 패키지: @cli-agent/core + @cli-agent/external-tools
외부 의존성: zod, pino (모두 core 경유)
```

```typescript
import { Registry } from '@cli-agent/core';
import type { ITool } from '@cli-agent/core';
import { McpManager } from '@cli-agent/external-tools';

const toolRegistry = new Registry<ITool>();
const mcpManager = new McpManager(toolRegistry);

// GitHub MCP 서버 연결 → 도구 자동 등록
await mcpManager.connect({
  name: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
});

// 등록된 도구 확인
const status = mcpManager.getServerStatus('github');
console.log(status.tools);  // ['github__create_issue', 'github__list_repos', ...]

// 도구 직접 호출
const tool = toolRegistry.get('github__list_repos');
const result = await tool.execute({ owner: 'my-org' }, context);

// 해제
await mcpManager.disconnect('github');
```

**이 레시피에서 사용하지 않는 것:** providers, agent, tools (내장), sandbox, core-packages 전부.

---

### 레시피 5: MCP + 내장 도구 + 에이전트 루프 (풀 에이전트)

> "파일 조작 + 셸 + MCP 외부 도구를 모두 갖춘 자율 에이전트를 만들고 싶다."

```
필요 패키지: @cli-agent/core + providers + tools + external-tools + agent
외부 의존성: zod, pino, LLM SDK, fast-glob
```

```typescript
import { EventBus } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import { McpManager } from '@cli-agent/external-tools';
import { AgentLoop } from '@cli-agent/agent';

// 내장 도구 Registry 생성
const toolRegistry = createToolRegistry();

// MCP 도구 추가 (같은 Registry에 등록됨)
const mcpManager = new McpManager(toolRegistry);
await mcpManager.connect({
  name: 'github',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
});

// 에이전트 생성
const agent = new AgentLoop({
  provider: createProvider(providerConfig),
  toolRegistry,  // 내장 + MCP 도구 모두 포함
  config: agentConfig,
  eventBus: new EventBus(),
  streaming: true,
});

const result = await agent.run('GitHub에서 이슈 목록을 가져와서 요약해줘');

// 정리
await mcpManager.disconnectAll();
```

---

### 레시피 6: 규칙 엔진만

> "에이전트 없이, 규칙 기반 검증 로직만 쓰고 싶다."

```
필요 패키지: @core/types + @core/rule
외부 의존성: 없음
```

```typescript
import type { IRule, RuleContext } from '@core/types';
import { RuleRegistry, RuleEngine, NoDestructiveCommandRule, PiiRedactRule } from '@core/rule';

const registry = new RuleRegistry();
registry.register(new NoDestructiveCommandRule());
registry.register(new PiiRedactRule());

const engine = new RuleEngine(registry);

const context: RuleContext = {
  toolName: 'shell_exec',
  toolParams: { command: 'rm -rf /' },
  userId: 'user-1',
  sessionId: 'session-1',
};

const result = await engine.evaluatePre(context);
console.log(result.allowed);  // false
console.log(result.reason);   // "Blocked by rule: no-destructive-command"
```

**이 레시피에서 사용하지 않는 것:** @cli-agent/* 전부. Layer 1과 완전히 독립.

---

### 레시피 7: 거버넌스 (팀/조직용 RBAC)

> "관리자가 프로필로 도구 접근을 통제하고, 감사 로그를 남기고 싶다."

```
필요 패키지: @core/types + @core/governance + @core/rule + @core/harness
선택 DB: pg | mysql2 | mongodb (peerDependency)
```

```typescript
import { GovernedPolicy, GovernanceAdmin, PostgresGovernanceStore } from '@core/governance';
import { RuleRegistry, RuleEngine, createGovernedRules } from '@core/rule';
import { HarnessBuilder } from '@core/harness';

// DB 연결
const store = new PostgresGovernanceStore({
  host: 'localhost', port: 5432, database: 'agentcore',
  user: 'admin', password: process.env.DB_PASSWORD,
});

// 거버넌스 정책
const policy = new GovernedPolicy(store);
const admin = new GovernanceAdmin(store);

// 프로필 생성
await admin.createProfile({
  name: 'backend-dev',
  allowedTools: ['file_*', 'shell_exec', 'github__*'],
  deniedTools: ['github__delete_repo'],
  approvalRequired: ['shell_exec'],
});

// Harness 조립
const harness = new HarnessBuilder()
  .withPolicy(policy)
  .withRules(createGovernedRules({ enableRateLimit: true, maxToolCalls: 100 }))
  .build();
```

---

### 레시피 8: Docker 샌드박스만

> "사용자 코드를 격리된 환경에서 실행하고 싶다."

```
필요 패키지: @cli-agent/core + @cli-agent/sandbox
외부 의존성: zod, pino, dockerode
선행 조건: Docker 데몬 실행 중
```

```typescript
import { DockerSandbox, SandboxManager } from '@cli-agent/sandbox';

const manager = new SandboxManager();

const result = await manager.execute({
  language: 'python',
  code: 'print(sum(range(100)))',
  timeoutMs: 10000,
});

console.log(result.stdout);   // "4950"
console.log(result.exitCode); // 0
```

**이 레시피에서 사용하지 않는 것:** providers, tools, agent, core-packages 전부.

---

### 레시피 조합 요약표

| 목적 | core | providers | tools | ext-tools | agent | sandbox | @core/* |
|------|:----:|:---------:|:-----:|:---------:|:-----:|:-------:|:-------:|
| LLM API 래퍼 | **O** | **O** | - | - | - | - | - |
| 에이전트 루프 | **O** | **O** | 선택 | - | **O** | - | - |
| 커스텀 도구 | **O** | - | 선택 | - | - | - | - |
| MCP 연결만 | **O** | - | - | **O** | - | - | - |
| 풀 에이전트 | **O** | **O** | **O** | **O** | **O** | - | - |
| 규칙 엔진만 | - | - | - | - | - | - | types + rule |
| 거버넌스 | **O** | **O** | **O** | - | **O** | - | 전부 |
| 샌드박스만 | **O** | - | - | - | - | **O** | - |

`O` = 필수, `선택` = 있으면 편리하지만 없어도 됨, `-` = 불필요.

---

## Helm / Kubernetes

`helm/agentcore/`에 전체 Helm 차트가 제공된다. 에이전트,
오케스트레이터, 거버넌스 서비스, 데이터베이스를 완전한 스택으로 배포한다.

```bash
helm install agentcore ./helm/agentcore -f values.yaml
```

모든 설정 옵션은 `helm/agentcore/values.yaml` 참고.

---

## 프로젝트 구조

```
agentcore/
├── packages/                # Layer 1: @cli-agent/*
│   ├── core/                #   타입, Registry, EventBus, Config
│   ├── providers/           #   LLM 프로바이더 (Claude, OpenAI, vLLM, ...)
│   ├── tools/               #   내장 도구 + MCP 클라이언트
│   ├── sandbox/             #   Docker 샌드박스
│   ├── agent/               #   에이전트 루프 엔진
│   ├── cli/                 #   터미널 REPL
│   └── ui/                  #   Electron 데스크톱 UI
│
├── core-packages/           # Layer 2: @core/*
│   ├── types/               #   공유 타입 + IPolicyProvider + Profile
│   ├── context-engine/      #   토큰 버짓 + 도구 필터링
│   ├── skill/               #   스킬 레지스트리
│   ├── rule/                #   룰 엔진
│   ├── orchestrator/        #   파이프라인 실행
│   ├── governance/          #   RBAC + 감사
│   └── harness/             #   도메인 조합 하네스
│
├── skills/                  # 내장 스킬 가이드라인 (.skill.md)
├── helm/agentcore/          # Kubernetes Helm 차트
├── docs/                    # 문서
├── package.json             # 루트 (pnpm 워크스페이스)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 언어 | TypeScript 5.4+ (strict 모드) |
| 런타임 | Node.js 18+ |
| 패키지 관리 | pnpm 워크스페이스 (모노레포) |
| 테스트 | Vitest |
| LLM SDK | @anthropic-ai/sdk, openai |
| 외부 도구 | MCP (stdio + SSE) |
| CLI | Commander, Chalk |
| 설정 검증 | Zod (판별 유니온) |
| 로깅 | Pino |
| 컨테이너 | Dockerode |
| 파일 검색 | fast-glob |
| 데스크톱 UI | Electron, React |
| Kubernetes | Helm 3 |

---

## 문서

| 문서 | 설명 |
|------|------|
| [Architecture](docs/architecture.md) | 내부 동작 프로세스, LLM 메시지 변환, 전체 흐름도 |
| [Tools](docs/tools.md) | 도구 시스템 상세 + 커스텀 도구 작성 가이드 |
| [Auth](docs/auth.md) | 7가지 인증 타입 (no-auth, api-key, OAuth, Azure AD, AWS IAM, GCP, credential-file) |
| [vLLM / Custom LLM](docs/vllm.md) | vLLM, Ollama, LocalAI 등 커스텀 LLM 엔드포인트 연동 |
| [Events](docs/events.md) | EventBus 이벤트 시스템 |
| [CLI UX](docs/cli-ux.md) | CLI 렌더링 UX + 슬래시 커맨드 전체 목록 |
| [SOUL.md](docs/soul.md) | 페르소나 시스템 (에이전트 성격/톤 커스터마이징) |
| [Memory](docs/memory.md) | 세션 간 영구 메모리 시스템 |
| [Getting Started](docs/getting-started.md) | 설치, 실행, CLI 옵션, 테스트 실행 |
| [Packages](docs/packages.md) | 전체 14개 패키지 상세 설명 |

---

## 라이선스

MIT
