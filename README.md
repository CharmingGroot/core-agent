# Chamelion

**어디서든 동작하는 적응형 AI 에이전트 프레임워크**

Chameleon + AI + Lion -- 인프라가 당신에게 맞춰야 한다는 원칙 위에 만든
AI 에이전트 프레임워크.

---

## 철학: 종속을 거부한다

### 벤더 종속 없음

**모든** LLM 백엔드와 동작한다. Claude, OpenAI, vLLM, Ollama, 또는 어떤
OpenAI 호환 서버든. 런타임에 슬래시 커맨드 하나로 프로바이더를 전환할 수 있다
-- 코드 변경도, 재배포도 필요 없다.

### 환경 종속 없음

**CLI**, **Electron 데스크톱 앱**, **Kubernetes** 안에서 실행된다.
코드 실행은 Docker 샌드박스에서 격리된다. 같은 코드베이스, 같은 패키지,
어떤 환경이든.

### 거버넌스 종속 없음

`IPolicyProvider` 패턴으로 정책과 로직을 분리한다:

- **OpenPolicy** -- 스탠드얼론 모드, 제로 설정, 데이터베이스 불필요.
  몇 분 만에 에이전트를 배포할 수 있다.
- **GovernedPolicy** -- 엔터프라이즈 RBAC + 멀티 DB 지원 (PostgreSQL,
  MySQL/MariaDB, MongoDB). 전체 감사 추적, 팀 관리, 승인 워크플로우.

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
| `tools` | 파일/셸 도구 (file_read, file_write, file_search, shell_exec) |
| `sandbox` | Docker 기반 코드 격리 실행 (JS, TS, Python, Bash) |
| `agent` | 에이전트 루프 엔진 -- LLM <-> Tool 디스패치 사이클 |
| `cli` / `ui` | 터미널 REPL (Commander + Chalk) 및 Electron 데스크톱 UI |

**Layer 2 -- `@core/*` (7개 패키지)**

| 패키지 | 역할 |
|---------|------|
| `types` | 공유 타입 + `IPolicyProvider` 인터페이스 |
| `context-engine` | 토큰 버짓 추적, 히스토리 압축, 스킬 범위 도구 필터링 (sLLM 32k 최적화) |
| `skill` | 스킬 정의, 로딩, 레지스트리 |
| `rule` | 조건부 로직 및 게이팅용 룰 엔진 |
| `orchestrator` | 파이프라인 실행 엔진 |
| `governance` | RBAC, 감사, 멀티 DB (OpenPolicy / GovernedPolicy) |
| `harness` | 도메인 조합 루트 -- 스킬, 룰, 에이전트, 정책을 조립 |

---

## 핵심 패턴

- **Registry** -- 모든 플러그인 가능 컴포넌트는 이름으로 등록; 모듈 간 직접 import 금지.
- **Wrapper** -- 외부 API (Anthropic SDK, OpenAI SDK, Docker)는 인터페이스 뒤에서 추상화.
- **Event-Driven** -- 모듈은 `EventBus`로 통신; 렌더러는 이벤트를 구독.
- **Native Function Calling** -- LLM 네이티브 `tool_use` 사용, 텍스트 파싱 ReAct 체인 아님.
- **Agent-as-Tool** -- 에이전트가 다른 에이전트를 도구로 호출하여 계층적 태스크 분해 가능.
- **IPolicyProvider** -- 거버넌스는 주입, 하드코딩 아님. 에이전트 코드 수정 없이 OpenPolicy를 GovernedPolicy로 교체.

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

## Helm / Kubernetes

`helm/chamelion/`에 전체 Helm 차트가 제공된다. 에이전트,
오케스트레이터, 거버넌스 서비스, 데이터베이스를 완전한 스택으로 배포한다.

```bash
helm install chamelion ./helm/chamelion -f values.yaml
```

모든 설정 옵션은 `helm/chamelion/values.yaml` 참고.

---

## 프로젝트 구조

```
chamelion/
├── packages/                # Layer 1: @cli-agent/*
│   ├── core/                #   타입, Registry, EventBus, Config
│   ├── providers/           #   LLM 프로바이더 (Claude, OpenAI, vLLM, ...)
│   ├── tools/               #   파일/셸 도구
│   ├── sandbox/             #   Docker 샌드박스
│   ├── agent/               #   에이전트 루프 엔진
│   ├── cli/                 #   터미널 REPL
│   └── ui/                  #   Electron 데스크톱 UI
│
├── core-packages/           # Layer 2: @core/*
│   ├── types/               #   공유 타입 + IPolicyProvider
│   ├── context-engine/      #   런타임 컨텍스트
│   ├── skill/               #   스킬 레지스트리
│   ├── rule/                #   룰 엔진
│   ├── orchestrator/        #   파이프라인 실행
│   ├── governance/          #   RBAC + 감사
│   └── harness/             #   도메인 조합 하네스
│
├── helm/chamelion/          # Kubernetes Helm 차트
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
| 테스트 | Vitest -- **14개 패키지, 473개 테스트** |
| LLM SDK | @anthropic-ai/sdk, openai |
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
