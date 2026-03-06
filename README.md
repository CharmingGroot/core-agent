# CLI Agent Core

Claude Code와 유사한 대화형 CLI 에이전트.
사용자의 자연어 요청을 LLM이 해석하고, 필요시 파일/셸 도구를 자동으로 호출하여 작업을 수행합니다.

```
사용자: "src 폴더에 있는 TypeScript 파일 목록을 보여줘"
   ↓
LLM: file_search 도구 호출 결정
   ↓
Agent: file_search({"pattern": "src/**/*.ts"}) 실행
   ↓
LLM: 결과를 자연어로 정리하여 응답
```

---

## 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [내부 동작 프로세스](#내부-동작-프로세스)
3. [도구 (Tools) 상세](#도구-tools-상세)
4. [인증 (Auth) 시스템](#인증-auth-시스템)
5. [커스텀 LLM 엔드포인트 (vLLM, Ollama 등)](#커스텀-llm-엔드포인트-vllm-ollama-등)
6. [이벤트 시스템](#이벤트-시스템)
7. [CLI 렌더링 UX](#cli-렌더링-ux)
8. [슬래시 커맨드 (라이브 설정)](#슬래시-커맨드-라이브-설정)
9. [SOUL.md (페르소나 시스템)](#soulmd-페르소나-시스템)
10. [메모리 시스템](#메모리-시스템)
11. [설치 및 실행](#설치-및-실행)
12. [패키지 상세](#패키지-상세)
13. [프로젝트 구조](#프로젝트-구조)
14. [기술 스택](#기술-스택)

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
    └── @cli-agent/agent      에이전트 루프 엔진 (LLM ↔ Tool 반복 실행)
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
│     사용자 입력 수신 → AgentLoop.run(message) 호출              │
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
│  │      → LLM이 응답 생성                                   │   │
│  │                                                          │   │
│  │      응답 타입:                                          │   │
│  │        • stopReason: "end_turn" → 최종 응답 (루프 종료)  │   │
│  │        • stopReason: "tool_use" → 도구 호출 요청         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│              stopReason === "tool_use" 인 경우                   │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 2-3. ToolDispatcher                                      │   │
│  │      toolCalls 배열을 순회하며 각 도구 실행               │   │
│  │                                                          │   │
│  │      ① Registry에서 도구 조회 (이름 기반)                │   │
│  │      ② PermissionManager: 권한 확인 (requiresPermission) │   │
│  │      ③ JSON.parse(toolCall.arguments) → 파라미터 추출    │   │
│  │      ④ tool.execute(params, context) 실행                │   │
│  │      ⑤ 결과를 MessageManager에 tool_result로 추가        │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│                             ▼                                   │
│           다시 2-2로 돌아감 (LLM에 도구 결과 전달)              │
│           → LLM이 결과를 보고 최종 응답 또는 추가 도구 호출     │
│                                                                 │
│  루프 종료 조건:                                                │
│    • stopReason === "end_turn" (LLM이 최종 응답)                │
│    • iterations >= maxIterations (반복 횟수 초과)               │
│    • context.isAborted (사용자 중단)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. CliRenderer                                                 │
│     EventBus 이벤트를 구독하여 실시간으로 터미널에 출력         │
│     → 도구 실행 박스, 토큰 사용량, 반복 횟수 등 표시           │
└─────────────────────────────────────────────────────────────────┘
```

### 구체적 예시: "src 폴더의 .ts 파일 목록을 보여줘"

```
[1단계] 사용자 → AgentLoop
  MessageManager에 추가:
    { role: "user", content: "src 폴더의 .ts 파일 목록을 보여줘" }

[2단계] AgentLoop → LLM (iteration 1)
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

[3단계] ToolDispatcher → file_search 실행
  ① Registry.get("file_search") → FileSearchTool 인스턴스
  ② requiresPermission: false → 권한 체크 스킵
  ③ JSON.parse('{"pattern": "src/**/*.ts"}')
  ④ fast-glob으로 패턴 매칭 실행
  ⑤ 결과: { success: true, output: "src/index.ts\nsrc/config.ts\n..." }

[4단계] AgentLoop → LLM (iteration 2)
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
      stopReason: "end_turn",    ← 루프 종료
      toolCalls: []
    }

[5단계] 결과 반환 → CliRenderer로 출력
```

### LLM 메시지 변환 (Provider별)

LLM에 보내는 메시지는 프로바이더마다 포맷이 다릅니다:

**Claude (Anthropic)**
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

**OpenAI**
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

---

## 도구 (Tools) 상세

Agent에 등록된 4개의 기본 도구입니다. LLM이 사용자 요청을 분석하여 적절한 도구를 선택합니다.

### file_read — 파일 읽기

| 항목 | 값 |
|------|-----|
| **이름** | `file_read` |
| **권한 필요** | 아니오 |
| **설명** | 지정된 경로의 파일 내용을 읽습니다 |

**파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `path` | string | 예 | 읽을 파일 경로 (작업 디렉토리 기준 상대 경로) |
| `encoding` | string | 아니오 | 파일 인코딩 (기본값: `utf-8`) |

**동작:**
1. `path`를 작업 디렉토리(`context.workingDirectory`)와 결합하여 절대 경로 생성
2. `node:fs/promises.readFile()`로 파일 읽기
3. 성공 시 파일 내용 반환, 실패 시 에러 메시지 반환

**예시 호출:**
```json
{ "path": "src/index.ts" }
→ { "success": true, "output": "import { ... }\nexport { ... }" }

{ "path": "nonexistent.txt" }
→ { "success": false, "error": "Failed to read file: ENOENT ..." }
```

---

### file_write — 파일 쓰기

| 항목 | 값 |
|------|-----|
| **이름** | `file_write` |
| **권한 필요** | **예** (실행 전 사용자 승인 필요) |
| **설명** | 파일에 내용을 쓰거나 새 파일을 생성합니다 |

**파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `path` | string | 예 | 쓸 파일 경로 |
| `content` | string | 예 | 파일에 쓸 내용 |

**동작:**
1. 경로의 부모 디렉토리가 없으면 `mkdir -p`로 자동 생성
2. `node:fs/promises.writeFile()`로 파일 쓰기
3. 파일이 이미 있으면 **덮어쓰기**

**예시 호출:**
```json
{ "path": "output/result.txt", "content": "Hello World" }
→ { "success": true, "output": "Written to /workspace/output/result.txt" }
```

---

### file_search — 파일 검색

| 항목 | 값 |
|------|-----|
| **이름** | `file_search` |
| **권한 필요** | 아니오 |
| **설명** | glob 패턴으로 파일을 검색합니다 |

**파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `pattern` | string | 예 | glob 패턴 (예: `**/*.ts`, `src/**/*.{js,jsx}`) |

**동작:**
1. `fast-glob` 라이브러리로 작업 디렉토리 기준 패턴 매칭
2. 최대 **100개** 결과 반환 (`MAX_RESULTS`)
3. `node_modules`, `.git` 등은 자동 제외

**예시 호출:**
```json
{ "pattern": "**/*.test.ts" }
→ {
    "success": true,
    "output": "tests/config.test.ts\ntests/registry.test.ts\n...",
    "metadata": { "count": 15 }
  }

{ "pattern": "**/*.xyz" }
→ { "success": true, "output": "No files found matching pattern: **/*.xyz" }
```

---

### shell_exec — 셸 명령 실행

| 항목 | 값 |
|------|-----|
| **이름** | `shell_exec` |
| **권한 필요** | **예** (실행 전 사용자 승인 필요) |
| **설명** | 셸 명령을 실행하고 결과를 반환합니다 |

**파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `command` | string | 예 | 실행할 셸 명령 |
| `timeout` | number | 아니오 | 타임아웃(ms). 기본값: 30000 (30초) |

**동작:**
1. `node:child_process.exec()`로 명령 실행
2. 작업 디렉토리(`context.workingDirectory`)에서 실행
3. 출력이 **100,000자** 초과 시 잘라냄
4. 타임아웃 초과 시 프로세스 강제 종료

**예시 호출:**
```json
{ "command": "ls -la" }
→ { "success": true, "output": "total 64\ndrwxr-xr-x  12 user  ..." }

{ "command": "git status" }
→ { "success": true, "output": "On branch master\nnothing to commit" }

{ "command": "nonexistent_command" }
→ { "success": false, "error": "Command failed: nonexistent_command\n/bin/sh: ..." }
```

---

### 커스텀 도구 추가

`ITool` 인터페이스를 구현하고 Registry에 등록하면 새 도구를 추가할 수 있습니다:

```typescript
import { BaseTool } from '@cli-agent/tools';
import type { ToolDescription, ToolResult, JsonObject } from '@cli-agent/core';
import type { RunContext } from '@cli-agent/core';

class GrepTool extends BaseTool {
  readonly name = 'grep';
  readonly requiresPermission = false;

  constructor() {
    super('grep');
  }

  describe(): ToolDescription {
    return {
      name: this.name,
      description: 'Search for a pattern in file contents',
      parameters: [
        this.createParam('pattern', 'string', 'Regex pattern to search', true),
        this.createParam('path', 'string', 'Directory to search in', false),
      ],
    };
  }

  async run(params: JsonObject, context: RunContext): Promise<ToolResult> {
    // 구현 ...
    return this.success('matching results here');
  }
}

// Registry에 등록
toolRegistry.register('grep', new GrepTool());
```

---

## 인증 (Auth) 시스템

API 키 외에 다양한 인증 방식을 지원합니다. `ProviderConfig.auth` 필드에 discriminated union으로 설정합니다.

### 지원하는 인증 타입

| 타입 | 설명 | 주요 필드 |
|------|------|-----------|
| `no-auth` | 인증 불필요 (로컬 vLLM, Ollama 등) | 없음 |
| `api-key` | 일반 API 키 | `apiKey` |
| `oauth` | OAuth 2.0 (Client Credentials / Refresh Token) | `clientId`, `clientSecret`, `tokenUrl` |
| `azure-ad` | Azure Active Directory | `tenantId`, `clientId`, `clientSecret` |
| `aws-iam` | AWS IAM (Bedrock용) | `region`, `accessKeyId`, `secretAccessKey` |
| `gcp-service-account` | Google Cloud 서비스 계정 | `projectId`, `keyFilePath` |
| `credential-file` | JSON 자격 증명 파일 | `filePath`, `profile` |

### 인증 설정 예시

```typescript
// API Key (가장 간단)
auth: { type: 'api-key', apiKey: 'sk-...' }

// OAuth 2.0 Client Credentials
auth: {
  type: 'oauth',
  clientId: 'my-client-id',
  clientSecret: 'my-secret',
  tokenUrl: 'https://auth.example.com/oauth/token',
  scopes: ['api.read', 'api.write'],
}

// Azure AD
auth: {
  type: 'azure-ad',
  tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientId: 'my-app-id',
  clientSecret: 'my-client-secret',
}

// AWS IAM (Bedrock)
auth: {
  type: 'aws-iam',
  region: 'us-east-1',
  accessKeyId: 'AKIA...',
  secretAccessKey: '...',
}

// Credential File
auth: {
  type: 'credential-file',
  filePath: '~/.config/cli-agent/credentials.json',
  profile: 'production',
}
```

### resolveAuth 함수

비동기 인증이 필요한 경우 (OAuth 토큰 교환, Azure AD 토큰 발급 등) `resolveAuth()`를 사용합니다:

```typescript
import { resolveAuth } from '@cli-agent/providers';

const credential = await resolveAuth({
  type: 'oauth',
  clientId: '...',
  clientSecret: '...',
  tokenUrl: 'https://auth.example.com/token',
});

// credential.token → 발급된 access_token
// credential.headers → { Authorization: 'Bearer ...' }
// credential.expiresAt → 만료 시간 (Date | undefined)
```

---

## 커스텀 LLM 엔드포인트 (vLLM, Ollama 등)

이 에이전트는 **OpenAI-compatible API를 제공하는 모든 LLM 서버**와 연동됩니다.
vLLM, Ollama, LocalAI, LMStudio, TGI 등 자체 호스팅 LLM을 사용하는 엔지니어를 위한 핵심 기능입니다.

### 동작 원리

`vllm`, `ollama`, `custom` 프로바이더는 모두 내부적으로 `OpenAIProvider`를 사용합니다.
OpenAI SDK의 `baseURL` 파라미터를 오버라이드하여 커스텀 서버로 요청을 라우팅합니다.

```
사용자 요청 → AgentLoop → OpenAIProvider(baseURL=커스텀) → vLLM/Ollama 서버
```

### 등록된 프로바이더 별칭

| Provider ID | 대상 | 설명 |
|-------------|------|------|
| `claude` | Anthropic API | Claude 모델 전용 |
| `openai` | OpenAI API | GPT 모델 전용 |
| `vllm` | vLLM 서버 | OpenAI-compatible API |
| `ollama` | Ollama 서버 | OpenAI-compatible API |
| `custom` | 임의 서버 | OpenAI-compatible API를 제공하는 모든 서버 |

### 사용법

#### vLLM 연동

```bash
# vLLM 서버가 http://gpu-server:8000 에서 실행 중인 경우
node packages/cli/dist/bin.js chat \
  -p vllm \
  -m meta-llama/Llama-3.1-70B-Instruct \
  -k no-auth \
  -u http://gpu-server:8000/v1
```

#### Ollama 연동

```bash
# Ollama가 로컬에서 실행 중인 경우
node packages/cli/dist/bin.js chat \
  -p ollama \
  -m llama3.1:70b \
  -k no-auth \
  -u http://localhost:11434/v1
```

#### 임의의 OpenAI-compatible 서버

```bash
# LMStudio, LocalAI, TGI 등
node packages/cli/dist/bin.js chat \
  -p custom \
  -m my-fine-tuned-model \
  -k no-auth \
  -u http://my-server:5000/v1
```

#### 런타임에서 전환

대화 중에도 슬래시 커맨드로 프로바이더를 전환할 수 있습니다:

```
> /provider vllm
  Provider changed to: vllm
> /model meta-llama/Llama-3.1-70B-Instruct
  Model changed to: meta-llama/Llama-3.1-70B-Instruct
```

### 프로그래밍 방식 (코드에서 사용)

```typescript
import { parseAgentConfig, noAuth } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';

// vLLM 프로바이더 설정
const config = parseAgentConfig({
  provider: {
    providerId: 'vllm',
    model: 'meta-llama/Llama-3.1-70B-Instruct',
    auth: noAuth(),                          // 인증 불필요
    baseUrl: 'http://gpu-server:8000/v1',    // vLLM 서버 URL
    maxTokens: 4096,
    temperature: 0.7,
  },
  workingDirectory: process.cwd(),
});

const provider = createProvider(config.provider);
const response = await provider.chat([
  { role: 'user', content: '안녕하세요' }
]);
```

### 커스텀 프로바이더 등록 (고급)

OpenAI-compatible이 아닌 LLM 서버를 사용하려면 `ILlmProvider` 인터페이스를 구현하고 등록합니다:

```typescript
import { registerProvider } from '@cli-agent/providers';
import { BaseProvider } from '@cli-agent/providers';

class MyCustomProvider extends BaseProvider {
  readonly providerId = 'my-llm';

  constructor(config: ProviderConfig) {
    super('my-llm-provider');
    // 커스텀 초기화
  }

  async chat(messages, tools?) {
    // 커스텀 LLM API 호출 구현
  }

  async *stream(messages, tools?) {
    // 커스텀 스트리밍 구현
  }
}

registerProvider('my-llm', MyCustomProvider);
```

### 구축형 에이전트를 위한 활용 시나리오

| 시나리오 | 설정 |
|----------|------|
| 사내 GPU 서버에 vLLM 배포 | `providerId: 'vllm'`, `baseUrl: 'http://internal:8000/v1'` |
| 에어갭 환경 (인터넷 차단) | `providerId: 'custom'`, `auth: noAuth()`, 로컬 서버 URL |
| 멀티 모델 A/B 테스트 | `/provider vllm` → 테스트 → `/provider openai` → 비교 |
| Fine-tuned 모델 사용 | `providerId: 'vllm'`, `model: 'my-org/custom-model-v2'` |
| Ollama로 로컬 개발 | `providerId: 'ollama'`, `baseUrl: 'http://localhost:11434/v1'` |

---

## 이벤트 시스템

`EventBus`가 에이전트 실행 전 과정을 이벤트로 broadcast합니다. CLI 렌더러, Electron UI 모두 이 이벤트를 구독하여 화면을 구성합니다.

### 이벤트 목록

| 이벤트 | 발생 시점 | 페이로드 |
|--------|-----------|----------|
| `agent:start` | 에이전트 루프 시작 | `{ runId }` |
| `agent:end` | 에이전트 루프 종료 | `{ runId, reason: 'complete' \| 'aborted' }` |
| `agent:error` | 에이전트 에러 발생 | `{ runId, error: Error }` |
| `llm:request` | LLM API 호출 직전 | `{ runId, messages }` |
| `llm:response` | LLM API 응답 수신 | `{ runId, response: LlmResponse }` |
| `llm:stream` | 스트리밍 청크 수신 | `{ chunk: string }` |
| `tool:start` | 도구 실행 시작 | `{ runId, toolCall }` |
| `tool:end` | 도구 실행 완료 | `{ runId, toolCall, result }` |
| `tool:permission` | 도구 권한 요청 | `{ toolName }` |

### 이벤트 구독 예시

```typescript
const eventBus = new EventBus();

eventBus.on('tool:start', ({ toolCall }) => {
  console.log(`도구 실행 시작: ${toolCall.name}`);
});

eventBus.on('tool:end', ({ toolCall, result }) => {
  console.log(`도구 실행 완료: ${toolCall.name} → ${result.success ? '성공' : '실패'}`);
});

eventBus.on('llm:response', ({ response }) => {
  console.log(`토큰 사용: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
});
```

---

## CLI 렌더링 UX

Claude Code와 유사한 리치 터미널 UX를 제공합니다.

### 실행 예시 출력

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
- package.json — 루트 패키지 설정
- packages/ — 모노레포 패키지 디렉토리
  - core/, providers/, tools/, sandbox/, agent/, cli/
...

────────────────────────────────────────────────────────────────────
  completed | 2 iteration(s) | tokens: 330 in / 110 out
────────────────────────────────────────────────────────────────────

>
```

### UX 요소 설명

| 요소 | 설명 |
|------|------|
| `Run: a1b2c3d4...` | 고유 실행 ID (RunContext.runId) |
| `[N] Thinking...` | N번째 LLM 호출 중 |
| `[N] 1 tool call(s)` | LLM이 도구 호출을 결정함 |
| `+ tool_name ──+` | 도구 실행 박스 (노란색 테두리) |
| `command: ls -la` | 도구에 전달된 파라미터 |
| `success (42ms)` | 실행 결과 + 소요 시간 |
| `... +3 lines` | 출력이 5줄 초과 시 접힘 표시 |
| `+──────────────+` | 도구 실행 박스 닫힘 (성공: 초록, 실패: 빨강) |
| `tokens: 330 in / 110 out` | 총 토큰 사용량 |
| `2 iteration(s)` | 총 LLM 호출 횟수 |

---

## 슬래시 커맨드 (라이브 설정)

대화 중 슬래시 커맨드로 모델, 프로바이더, 온도 등을 실시간 변경할 수 있습니다.
설정 변경 시 AgentLoop이 자동으로 재생성됩니다 (대화 히스토리는 초기화).

### 전체 명령어

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

### 사용 예시

```
> /config
  Current Configuration:
  ─────────────────────────────────
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

---

## SOUL.md (페르소나 시스템)

프로젝트 루트에 `SOUL.md` 파일을 두면 에이전트의 페르소나, 톤, 행동 규칙을 정의할 수 있습니다.
Open Claw의 SOUL.md 컨셉에서 영감을 받았습니다.

### 동작 원리

```
시스템 프롬프트 구성:
  [1] <soul> SOUL.md 내용 </soul>       ← 페르소나/톤
  [2] 사용자 시스템 프롬프트              ← /system으로 설정한 내용
  [3] <memory> 메모리 항목들 </memory>   ← 영구 기억
```

SOUL.md는 시스템 프롬프트의 **가장 앞**에 위치하여 에이전트의 기본 성격을 정의합니다.

### 시작 방법

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

### 기본 템플릿

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

### 커스터마이징 예시

**개인 비서형:**
```markdown
# Soul

## Persona
You are my personal productivity assistant. You know my work habits,
preferences, and current projects.

## Tone
- Casual and friendly (like a colleague)
- Use Korean when I write in Korean
- Be proactive — suggest next steps

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

### SOUL.md 관리

| 명령 | 설명 |
|------|------|
| `/soul` | 현재 로드된 SOUL.md 내용 표시 (최대 20줄) |
| `/soul init` | 기본 SOUL.md 생성 (이미 있으면 스킵) |
| `/soul reload` | 파일 수정 후 다시 로드 |

SOUL.md를 직접 텍스트 에디터로 수정한 후 `/soul reload`로 반영할 수 있습니다.

---

## 메모리 시스템

에이전트는 세션 간 지속되는 메모리를 지원합니다.
프로젝트 디렉토리의 `.cli-agent/MEMORY.md`에 마크다운 형태로 저장됩니다.

### 동작 원리

```
.cli-agent/
└── MEMORY.md     ← 영구 메모리 파일
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

### 사용법

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

### 특성

- 중복 항목 자동 방지
- 빈 문자열 저장 불가
- 키워드 기반 삭제 (대소문자 무시)
- `/exit` 시 자동 저장
- 마크다운 형태로 사람이 직접 편집 가능

### MEMORY.md 파일 형식

```markdown
# Memory

- 이 프로젝트는 pnpm workspace를 사용한다
- 사용자는 한국어를 선호한다
- TypeScript strict mode 활성화됨
```

---

## 설치 및 실행

### 사전 요구사항

- **Node.js** 18.0.0 이상 (권장: 20+)
- **pnpm** 8.0.0 이상

```bash
# pnpm이 없다면 설치
npm install -g pnpm
```

### 설치

```bash
# 레포지토리 클론
git clone https://github.com/CharmingGroot/core-agent.git
cd core-agent

# 의존성 설치
pnpm install

# 전체 빌드 (필수 — CLI 실행 전 반드시 필요)
pnpm build
```

### 실행 방법

#### 대화 모드 (Interactive Chat)

```bash
# Claude 사용
node packages/cli/dist/bin.js chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k YOUR_ANTHROPIC_API_KEY

# OpenAI 사용
node packages/cli/dist/bin.js chat \
  -p openai \
  -m gpt-4 \
  -k YOUR_OPENAI_API_KEY

# 옵션 전체 지정
node packages/cli/dist/bin.js chat \
  -p openai \
  -m gpt-4o \
  -k YOUR_KEY \
  --max-tokens 8192 \
  --temperature 0.5 \
  --system-prompt "당신은 시니어 개발자입니다." \
  -d /path/to/project
```

#### 단일 실행 모드

```bash
node packages/cli/dist/bin.js run "package.json의 내용을 보여줘" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k YOUR_API_KEY
```

#### 빌드 없이 실행 (개발용)

```bash
# tsx로 TypeScript 직접 실행 (빌드 불필요)
npx tsx packages/cli/src/bin.ts chat \
  -p openai \
  -m gpt-4 \
  -k YOUR_KEY
```

### CLI 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `-p, --provider <id>` | LLM 프로바이더 (`claude`, `openai`, `vllm`, `ollama`, `custom`) | (필수) |
| `-m, --model <name>` | 모델명 (`claude-sonnet-4-6`, `gpt-4`, `gpt-4o` 등) | (필수) |
| `-k, --api-key <key>` | API 키 | (필수) |
| `-u, --base-url <url>` | 커스텀 API 베이스 URL | 프로바이더 기본값 |
| `--max-tokens <n>` | 최대 응답 토큰 수 | `4096` |
| `--temperature <n>` | 샘플링 온도 (0~2) | `0.7` |
| `--system-prompt <text>` | 시스템 프롬프트 | 없음 |
| `-d, --directory <path>` | 작업 디렉토리 (도구 실행 기준 경로) | 현재 디렉토리 |

### 대화 모드 명령어

대화 중 사용 가능한 전체 슬래시 커맨드는 [슬래시 커맨드 (라이브 설정)](#슬래시-커맨드-라이브-설정) 섹션을 참조하세요.

### vLLM / Ollama 실행 예시

```bash
# vLLM (자체 GPU 서버)
node packages/cli/dist/bin.js chat \
  -p vllm \
  -m meta-llama/Llama-3.1-70B-Instruct \
  -k no-auth \
  -u http://gpu-server:8000/v1

# Ollama (로컬)
node packages/cli/dist/bin.js chat \
  -p ollama \
  -m llama3.1:70b \
  -k no-auth \
  -u http://localhost:11434/v1
```

### 환경 변수로 API 키 설정 (권장)

```bash
# .bashrc 또는 .zshrc에 추가
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# 환경변수 참조하여 실행
node packages/cli/dist/bin.js chat -p claude -m claude-sonnet-4-6 -k $ANTHROPIC_API_KEY
```

### 테스트 실행

```bash
# 전체 테스트 (239개)
pnpm -r test

# 패키지별 테스트
pnpm --filter @cli-agent/core test        # 56 tests
pnpm --filter @cli-agent/providers test    # 32 tests
pnpm --filter @cli-agent/tools test        # 24 tests
pnpm --filter @cli-agent/sandbox test      # 11 tests
pnpm --filter @cli-agent/agent test        # 32 tests
pnpm --filter @cli-agent/cli test          # 45 tests
pnpm --filter @cli-agent/ui test           # 39 tests
```

---

## 패키지 상세

### @cli-agent/core (56 tests)

모든 패키지가 의존하는 핵심 인프라.

| 모듈 | 설명 |
|------|------|
| `Registry<T>` | 제네릭 레지스트리. `register(name, item)`, `get(name)`, `tryGet(name)`, `has(name)`, `getAll()` |
| `EventBus` | 타입 안전 이벤트 시스템. `on(event, handler)`, `emit(event, data)`, `once()` |
| `RunContext` | 실행 컨텍스트. `runId`, `config`, `eventBus`, `AbortController`, `metadata` 포함 |
| `Config` | zod 스키마 기반 설정 검증. `providerConfigSchema`, `agentConfigSchema` |
| `Logger` | pino 기반 구조화 로깅. `createChildLogger(name)` |
| `Errors` | 계층화된 에러 클래스. `AgentError` → `RegistryError`, `ConfigError`, `ProviderError`, `ToolExecutionError`, `SandboxError`, `PermissionDeniedError`, `AbortError` |

### @cli-agent/providers (32 tests)

LLM API 래퍼. Wrapper 패턴으로 외부 SDK 추상화.

| 모듈 | 설명 |
|------|------|
| `BaseProvider` | 추상 클래스. `ILlmProvider` 인터페이스 구현 |
| `ClaudeProvider` | `@anthropic-ai/sdk` 래핑. `chat()` + `stream()` 지원 |
| `OpenAIProvider` | `openai` SDK 래핑. `chat()` + `stream()` 지원 |
| `ProviderFactory` | Registry 기반 팩토리. `createProvider(config)` |
| `resolveAuth()` | 7가지 인증 타입 리졸버 (no-auth, api-key, oauth, azure-ad, aws-iam, gcp, credential-file) |
| `extractToken()` | AuthConfig에서 동기적으로 토큰 추출 |

### @cli-agent/tools (24 tests)

파일/셸 도구. `BaseTool` 추상 클래스 기반.

| 도구 | 권한 | 설명 |
|------|------|------|
| `file_read` | 불필요 | 파일 읽기 |
| `file_write` | **필요** | 파일 쓰기 + 디렉토리 자동 생성 |
| `file_search` | 불필요 | fast-glob 기반 파일 패턴 검색 (최대 100개) |
| `shell_exec` | **필요** | 셸 명령 실행 + 타임아웃(30초) + 출력 제한(100KB) |

### @cli-agent/sandbox (11 tests)

Docker 기반 코드 격리 실행 환경.

| 모듈 | 설명 |
|------|------|
| `DockerSandbox` | `dockerode` 래핑. 컨테이너 생성 → 코드 실행 → 결과 수집 → 삭제 |
| `SandboxManager` | 컨테이너 풀 관리. `acquire()` → 사용 → `release()`. 풀 고갈 시 자동 생성 |

지원 언어: JavaScript, TypeScript, Python, Bash, sh

### @cli-agent/agent (32 tests)

에이전트 루프 엔진. LLM ↔ Tool 반복 실행의 핵심.

| 모듈 | 설명 |
|------|------|
| `AgentLoop` | 메인 루프. LLM 호출 → tool_use 판단 → 도구 실행 → 결과 피드백 → 반복 |
| `ToolDispatcher` | 도구 호출 디스패치. Registry 조회 → 권한 체크 → 실행 → 이벤트 발행 |
| `MessageManager` | 대화 히스토리 관리. system/user/assistant/tool_result 메시지 관리 |
| `PermissionManager` | 도구별 권한 체크. `requiresPermission: true`인 도구는 핸들러로 승인 요청 |

### @cli-agent/cli (45 tests)

터미널 인터페이스 + 메모리 + 페르소나.

| 모듈 | 설명 |
|------|------|
| `createCliApp()` | Commander 기반 `chat`/`run` 커맨드 정의 |
| `CliRenderer` | EventBus 구독 → 박스 스타일 도구 출력, 토큰 트래킹, 접힘 표시 |
| `InputHandler` | readline 기반 REPL 입력. 18개 슬래시 커맨드 파싱 |
| `MemoryManager` | `.cli-agent/MEMORY.md` 영구 메모리. 세션 간 기억 유지 |
| `SoulLoader` | `SOUL.md` 페르소나 로더. 시스템 프롬프트 앞에 `<soul>` 블록 주입 |

---

## 프로젝트 구조

```
cli-agent-core/
├── packages/
│   ├── core/                # 핵심 인프라
│   │   ├── src/
│   │   │   ├── types/       # 타입 정의 (tool, provider, sandbox, events, auth)
│   │   │   ├── errors/      # 에러 클래스 계층
│   │   │   ├── registry.ts  # Registry<T> 제네릭 클래스
│   │   │   ├── event-bus.ts # 타입 안전 이벤트 버스
│   │   │   ├── run-context.ts # 실행 컨텍스트
│   │   │   ├── config.ts    # zod 스키마 + 파서
│   │   │   └── logger.ts    # pino 로거
│   │   └── tests/           # 56 tests
│   │
│   ├── providers/           # LLM 프로바이더
│   │   ├── src/
│   │   │   ├── auth/        # 인증 리졸버 (resolveAuth, extractToken)
│   │   │   ├── base-provider.ts
│   │   │   ├── claude-provider.ts
│   │   │   ├── openai-provider.ts
│   │   │   └── provider-factory.ts
│   │   └── tests/           # 32 tests
│   │
│   ├── tools/               # 도구
│   │   ├── src/
│   │   │   ├── base-tool.ts
│   │   │   ├── file-read.ts
│   │   │   ├── file-write.ts
│   │   │   ├── file-search.ts
│   │   │   ├── shell-exec.ts
│   │   │   └── tool-registry.ts
│   │   └── tests/           # 24 tests
│   │
│   ├── sandbox/             # Docker 샌드박스
│   │   ├── src/
│   │   │   ├── docker-wrapper.ts
│   │   │   └── sandbox-manager.ts
│   │   └── tests/           # 11 tests
│   │
│   ├── agent/               # 에이전트 루프
│   │   ├── src/
│   │   │   ├── agent-loop.ts
│   │   │   ├── tool-dispatcher.ts
│   │   │   ├── message-manager.ts
│   │   │   └── permission.ts
│   │   └── tests/           # 32 tests
│   │
│   ├── cli/                 # CLI 인터페이스
│   │   ├── src/
│   │   │   ├── bin.ts       # 진입점
│   │   │   ├── cli-app.ts   # Commander 설정
│   │   │   ├── renderer.ts  # 리치 터미널 렌더러
│   │   │   ├── input-handler.ts  # 슬래시 커맨드 파서
│   │   │   ├── memory-manager.ts # 영구 메모리 (.cli-agent/MEMORY.md)
│   │   │   ├── soul-loader.ts    # SOUL.md 페르소나 로더
│   │   │   └── commands/    # chat.ts, run.ts
│   │   └── tests/           # 45 tests
│   │
│   └── ui/                  # Electron UI (선택적)
│       ├── src/
│       │   ├── main/        # Electron 메인 프로세스
│       │   └── renderer/    # React 렌더러
│       └── tests/           # 39 tests
│
├── package.json             # 루트 (pnpm workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── TEST_SCENARIOS.md        # 수동 테스트 시나리오
```

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 언어 | TypeScript 5.4+ (strict mode) |
| 런타임 | Node.js 18+ |
| 패키지 관리 | pnpm workspace (모노레포) |
| 테스트 | vitest (239 tests) |
| LLM SDK | @anthropic-ai/sdk, openai |
| CLI | commander, chalk |
| 설정 검증 | zod (discriminated union) |
| 로깅 | pino |
| 컨테이너 | dockerode |
| 파일 검색 | fast-glob |
| UI (선택적) | Electron, React |

---

## 라이선스

MIT
