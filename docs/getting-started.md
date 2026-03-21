[< README](../README.md)

# AgentCore - 설치 및 실행

---

## 사전 요구사항

- **Node.js** 18.0.0 이상 (권장: 20+)
- **pnpm** 8.0.0 이상

```bash
# pnpm이 없다면 설치
npm install -g pnpm
```

---

## 설치

```bash
# 레포지토리 클론
git clone https://github.com/CharmingGroot/core-agent.git
cd core-agent

# 의존성 설치
pnpm install

# 전체 빌드 (필수 -- CLI 실행 전 반드시 필요)
pnpm build
```

---

## 실행 방법

### 대화 모드 (Interactive Chat)

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

### 단일 실행 모드

```bash
node packages/cli/dist/bin.js run "package.json의 내용을 보여줘" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k YOUR_API_KEY
```

### 빌드 없이 실행 (개발용)

```bash
# tsx로 TypeScript 직접 실행 (빌드 불필요)
npx tsx packages/cli/src/bin.ts chat \
  -p openai \
  -m gpt-4 \
  -k YOUR_KEY
```

---

## CLI 옵션

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

---

## 대화 모드 명령어

대화 중 사용 가능한 전체 슬래시 커맨드는 [CLI UX & 슬래시 커맨드](./cli-ux.md) 문서를 참조하세요.

---

## vLLM / Ollama 실행 예시

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

---

## 환경 변수로 API 키 설정 (권장)

```bash
# .bashrc 또는 .zshrc에 추가
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# 환경변수 참조하여 실행
node packages/cli/dist/bin.js chat -p claude -m claude-sonnet-4-6 -k $ANTHROPIC_API_KEY
```

---

## 테스트 실행

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
