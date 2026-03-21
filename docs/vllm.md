[< README](../README.md)

# AgentCore - 커스텀 LLM 엔드포인트 (vLLM, Ollama 등)

이 에이전트는 **OpenAI-compatible API를 제공하는 모든 LLM 서버**와 연동됩니다.
vLLM, Ollama, LocalAI, LMStudio, TGI 등 자체 호스팅 LLM을 사용하는 엔지니어를 위한 핵심 기능입니다.

---

## 동작 원리

`vllm`, `ollama`, `custom` 프로바이더는 모두 내부적으로 `OpenAIProvider`를 사용합니다.
OpenAI SDK의 `baseURL` 파라미터를 오버라이드하여 커스텀 서버로 요청을 라우팅합니다.

```
사용자 요청 -> AgentLoop -> OpenAIProvider(baseURL=커스텀) -> vLLM/Ollama 서버
```

---

## 등록된 프로바이더 별칭

| Provider ID | 대상 | 설명 |
|-------------|------|------|
| `claude` | Anthropic API | Claude 모델 전용 |
| `openai` | OpenAI API | GPT 모델 전용 |
| `vllm` | vLLM 서버 | OpenAI-compatible API |
| `ollama` | Ollama 서버 | OpenAI-compatible API |
| `custom` | 임의 서버 | OpenAI-compatible API를 제공하는 모든 서버 |

---

## 사용법

### vLLM 연동

```bash
# vLLM 서버가 http://gpu-server:8000 에서 실행 중인 경우
node packages/cli/dist/bin.js chat \
  -p vllm \
  -m meta-llama/Llama-3.1-70B-Instruct \
  -k no-auth \
  -u http://gpu-server:8000/v1
```

### Ollama 연동

```bash
# Ollama가 로컬에서 실행 중인 경우
node packages/cli/dist/bin.js chat \
  -p ollama \
  -m llama3.1:70b \
  -k no-auth \
  -u http://localhost:11434/v1
```

### 임의의 OpenAI-compatible 서버

```bash
# LMStudio, LocalAI, TGI 등
node packages/cli/dist/bin.js chat \
  -p custom \
  -m my-fine-tuned-model \
  -k no-auth \
  -u http://my-server:5000/v1
```

### 런타임에서 전환

대화 중에도 슬래시 커맨드로 프로바이더를 전환할 수 있습니다:

```
> /provider vllm
  Provider changed to: vllm
> /model meta-llama/Llama-3.1-70B-Instruct
  Model changed to: meta-llama/Llama-3.1-70B-Instruct
```

---

## 프로그래밍 방식 (코드에서 사용)

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

---

## 커스텀 프로바이더 등록 (고급)

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

---

## 구축형 에이전트를 위한 활용 시나리오

| 시나리오 | 설정 |
|----------|------|
| 사내 GPU 서버에 vLLM 배포 | `providerId: 'vllm'`, `baseUrl: 'http://internal:8000/v1'` |
| 에어갭 환경 (인터넷 차단) | `providerId: 'custom'`, `auth: noAuth()`, 로컬 서버 URL |
| 멀티 모델 A/B 테스트 | `/provider vllm` -> 테스트 -> `/provider openai` -> 비교 |
| Fine-tuned 모델 사용 | `providerId: 'vllm'`, `model: 'my-org/custom-model-v2'` |
| Ollama로 로컬 개발 | `providerId: 'ollama'`, `baseUrl: 'http://localhost:11434/v1'` |
