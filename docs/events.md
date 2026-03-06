[< README](../README.md)

# Chamelion - 이벤트 시스템

`EventBus`가 에이전트 실행 전 과정을 이벤트로 broadcast합니다. CLI 렌더러, Electron UI 모두 이 이벤트를 구독하여 화면을 구성합니다.

---

## 이벤트 목록

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

---

## 이벤트 구독 예시

```typescript
const eventBus = new EventBus();

eventBus.on('tool:start', ({ toolCall }) => {
  console.log(`도구 실행 시작: ${toolCall.name}`);
});

eventBus.on('tool:end', ({ toolCall, result }) => {
  console.log(`도구 실행 완료: ${toolCall.name} -> ${result.success ? '성공' : '실패'}`);
});

eventBus.on('llm:response', ({ response }) => {
  console.log(`토큰 사용: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
});
```
