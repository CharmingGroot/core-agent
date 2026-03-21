[< README](../README.md)

# AgentCore - 도구 (Tools) 상세

Agent에 등록된 4개의 기본 도구입니다. LLM이 사용자 요청을 분석하여 적절한 도구를 선택합니다.

---

## file_read -- 파일 읽기

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
-> { "success": true, "output": "import { ... }\nexport { ... }" }

{ "path": "nonexistent.txt" }
-> { "success": false, "error": "Failed to read file: ENOENT ..." }
```

---

## file_write -- 파일 쓰기

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
-> { "success": true, "output": "Written to /workspace/output/result.txt" }
```

---

## file_search -- 파일 검색

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
-> {
    "success": true,
    "output": "tests/config.test.ts\ntests/registry.test.ts\n...",
    "metadata": { "count": 15 }
  }

{ "pattern": "**/*.xyz" }
-> { "success": true, "output": "No files found matching pattern: **/*.xyz" }
```

---

## shell_exec -- 셸 명령 실행

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
-> { "success": true, "output": "total 64\ndrwxr-xr-x  12 user  ..." }

{ "command": "git status" }
-> { "success": true, "output": "On branch master\nnothing to commit" }

{ "command": "nonexistent_command" }
-> { "success": false, "error": "Command failed: nonexistent_command\n/bin/sh: ..." }
```

---

## 커스텀 도구 추가

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
