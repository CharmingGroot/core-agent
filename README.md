# Chamelion

**Adaptive AI Agent Framework That Works Anywhere**

Chameleon + AI + Lion -- an AI agent framework built on the principle that
infrastructure should adapt to you, not the other way around.

---

## Philosophy: 종속을 거부한다 (Reject Lock-in)

### No Vendor Lock

Works with **any** LLM backend. Claude, OpenAI, vLLM, Ollama, or any
OpenAI-compatible server. Switch providers at runtime with a single slash
command -- no code changes, no redeployment.

### No Environment Lock

Runs as a **CLI**, an **Electron desktop app**, or inside **Kubernetes**.
Code execution is isolated in Docker sandboxes. Same codebase, same packages,
any surface.

### No Governance Lock

The `IPolicyProvider` pattern separates policy from logic:

- **OpenPolicy** -- standalone mode, zero config, no database required.
  Ship an agent in minutes.
- **GovernedPolicy** -- enterprise RBAC with multi-DB support (PostgreSQL,
  MySQL/MariaDB, MongoDB). Full audit trail, team management, approval workflows.

Your governance requirements change; your agent code does not.

---

## Architecture Overview

Two-layer monorepo. Layer 1 is the agent runtime. Layer 2 is the
orchestration and governance plane.

```
Layer 2: @core/* (Orchestration)
┌──────────┬────────────────┬─────────┬──────┬──────────────┬────────────┬─────────┐
│  types   │ context-engine │  skill  │ rule │ orchestrator │ governance │ harness │
└──────────┴───────┬────────┴────┬────┴──┬───┴──────┬───────┴─────┬──────┴────┬────┘
                   │             │       │          │             │           │
Layer 1: @cli-agent/* (Agent Runtime)
┌──────────┬────────────┬─────────┬─────────┬─────────┬──────────────────┐
│   core   │  providers │  tools  │ sandbox │  agent  │  cli / electron  │
└──────────┴────────────┴─────────┴─────────┴─────────┴──────────────────┘
```

**Layer 1 -- `@cli-agent/*` (6 packages)**

| Package | Responsibility |
|---------|---------------|
| `core` | Types, Registry, EventBus, RunContext, Config (zod), Logger, Errors |
| `providers` | LLM wrappers (Claude, OpenAI, vLLM, Ollama, Custom) + auth resolvers |
| `tools` | File/shell tools (file_read, file_write, file_search, shell_exec) |
| `sandbox` | Docker-based code isolation (JS, TS, Python, Bash) |
| `agent` | Agent loop engine -- LLM <-> Tool dispatch cycle |
| `cli` / `ui` | Terminal REPL (Commander + Chalk) and Electron desktop UI |

**Layer 2 -- `@core/*` (7 packages)**

| Package | Responsibility |
|---------|---------------|
| `types` | Shared types + `IPolicyProvider` interface |
| `context-engine` | Token budget tracking, history compression, skill-scoped tool filtering (sLLM 32k optimized) |
| `skill` | Skill definition, loading, and registry |
| `rule` | Rule engine for conditional logic and gating |
| `orchestrator` | Pipeline execution engine |
| `governance` | RBAC, audit, multi-DB (OpenPolicy / GovernedPolicy) |
| `harness` | Domain composition root -- assembles skills, rules, agents, and policy |

---

## Key Patterns

- **Registry** -- all pluggable components register by name; no direct imports between modules.
- **Wrapper** -- external APIs (Anthropic SDK, OpenAI SDK, Docker) are abstracted behind interfaces.
- **Event-Driven** -- modules communicate via `EventBus`; renderers subscribe to events.
- **Native Function Calling** -- uses LLM-native `tool_use`, not text-parsed ReAct chains.
- **Agent-as-Tool** -- agents can invoke other agents as tools for hierarchical task decomposition.
- **IPolicyProvider** -- governance is injected, not hardcoded. Swap OpenPolicy for GovernedPolicy without touching agent code.

---

## Quick Start

> Full instructions: `docs/getting-started.md`

```bash
# Install and build
pnpm install && pnpm build

# Claude
node packages/cli/dist/bin.js chat \
  -p claude -m claude-sonnet-4-6 -k $ANTHROPIC_API_KEY

# OpenAI
node packages/cli/dist/bin.js chat \
  -p openai -m gpt-4o -k $OPENAI_API_KEY

# vLLM (self-hosted, no auth)
node packages/cli/dist/bin.js chat \
  -p vllm -m meta-llama/Llama-3.1-70B-Instruct \
  -k no-auth -u http://gpu-server:8000/v1

# Ollama (local)
node packages/cli/dist/bin.js chat \
  -p ollama -m llama3.1:70b \
  -k no-auth -u http://localhost:11434/v1
```

Switch providers live during a conversation:

```
> /provider vllm
> /model meta-llama/Llama-3.1-70B-Instruct
```

---

## Helm / Kubernetes

A full Helm chart is provided at `helm/chamelion/`. It deploys the agent,
orchestrator, governance service, and database as a complete stack.

```bash
helm install chamelion ./helm/chamelion -f values.yaml
```

See `helm/chamelion/values.yaml` for all configurable options.

---

## Project Structure

```
chamelion/
├── packages/                # Layer 1: @cli-agent/*
│   ├── core/                #   Types, Registry, EventBus, Config
│   ├── providers/           #   LLM providers (Claude, OpenAI, vLLM, ...)
│   ├── tools/               #   File/shell tools
│   ├── sandbox/             #   Docker sandbox
│   ├── agent/               #   Agent loop engine
│   ├── cli/                 #   Terminal REPL
│   └── ui/                  #   Electron desktop UI
│
├── core-packages/           # Layer 2: @core/*
│   ├── types/               #   Shared types + IPolicyProvider
│   ├── context-engine/      #   Runtime context
│   ├── skill/               #   Skill registry
│   ├── rule/                #   Rule engine
│   ├── orchestrator/        #   Pipeline execution
│   ├── governance/          #   RBAC + audit
│   └── harness/             #   Domain composition harness
│
├── helm/chamelion/          # Kubernetes Helm chart
├── docs/                    # Documentation
├── package.json             # Root (pnpm workspace)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Tech Stack

| Area | Technology |
|------|-----------|
| Language | TypeScript 5.4+ (strict mode) |
| Runtime | Node.js 18+ |
| Package management | pnpm workspace (monorepo) |
| Testing | Vitest -- **473 tests across 14 packages** |
| LLM SDKs | @anthropic-ai/sdk, openai |
| CLI | Commander, Chalk |
| Config validation | Zod (discriminated unions) |
| Logging | Pino |
| Containers | Dockerode |
| File search | fast-glob |
| Desktop UI | Electron, React |
| Kubernetes | Helm 3 |

---

## Documentation

| Document | Description |
|----------|-------------|
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

## License

MIT
