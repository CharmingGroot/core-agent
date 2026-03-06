# CLI Agent Core - Test Scenarios

## 1. Unit Test (automated)

```bash
# Run all tests
pnpm -r test

# Run specific package tests
pnpm --filter @cli-agent/core test
pnpm --filter @cli-agent/providers test
pnpm --filter @cli-agent/tools test
pnpm --filter @cli-agent/sandbox test
pnpm --filter @cli-agent/agent test
pnpm --filter @cli-agent/cli test
```

---

## 2. Manual Test Scenarios

### Scenario 1: CLI Chat - Basic Conversation (Claude)

```bash
# Start interactive chat with Claude
npx tsx packages/cli/src/bin.ts chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY

# Expected:
# - "CLI Agent" banner appears
# - Prompt ">" is shown
# - Type "Hello, what can you do?" -> LLM responds with capabilities
# - Type "/help" -> shows available commands
# - Type "/exit" -> exits cleanly
```

### Scenario 2: CLI Chat - Basic Conversation (OpenAI)

```bash
npx tsx packages/cli/src/bin.ts chat \
  -p openai \
  -m gpt-4o \
  -k $OPENAI_API_KEY

# Expected: Same as Scenario 1 but using OpenAI
```

### Scenario 3: Single Run Mode

```bash
npx tsx packages/cli/src/bin.ts run "What is 2+2?" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY

# Expected:
# - LLM responds with "4" (or similar)
# - Process exits automatically
```

### Scenario 4: Tool Use - File Read

```bash
# Create test file first
echo "Hello from test file" > /tmp/test-agent-file.txt

npx tsx packages/cli/src/bin.ts run "Read the file at /tmp/test-agent-file.txt and tell me its contents" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY \
  -d /tmp

# Expected:
# - Shows "Tool: file_read" in yellow
# - Shows "Result: Hello from test file" in green
# - LLM responds with the file contents
```

### Scenario 5: Tool Use - File Write

```bash
npx tsx packages/cli/src/bin.ts run "Create a file called hello.txt with 'Hello World' in it" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY \
  -d /tmp

# Expected:
# - Shows "Tool: file_write" in yellow
# - File /tmp/hello.txt is created with "Hello World"
# - LLM confirms the file was created
```

### Scenario 6: Tool Use - File Search

```bash
npx tsx packages/cli/src/bin.ts run "Find all TypeScript files in this directory" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY \
  -d $(pwd)

# Expected:
# - Shows "Tool: file_search" in yellow
# - Lists .ts files found
# - LLM summarizes the results
```

### Scenario 7: Tool Use - Shell Execution

```bash
npx tsx packages/cli/src/bin.ts run "Run 'node --version' and tell me the result" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY

# Expected:
# - Shows "Tool: shell_exec" in yellow
# - Shows node version output in green
# - LLM reports the version
```

### Scenario 8: Multi-Step Tool Use

```bash
npx tsx packages/cli/src/bin.ts chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY \
  -d /tmp

# Then type:
# > Create a file called numbers.txt with numbers 1-10, then read it back to verify

# Expected:
# - file_write tool called (writes numbers.txt)
# - file_read tool called (reads numbers.txt)
# - LLM confirms both operations
# - Multiple iterations visible in output
```

### Scenario 9: Error Handling - Invalid API Key

```bash
npx tsx packages/cli/src/bin.ts run "Hello" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k invalid-key

# Expected:
# - Red error message about authentication failure
# - Process exits with error
```

### Scenario 10: Error Handling - Missing Provider

```bash
npx tsx packages/cli/src/bin.ts run "Hello" \
  -p unknown \
  -m some-model \
  -k some-key

# Expected:
# - Error: "Unknown provider: 'unknown'. Available: claude, openai"
```

### Scenario 11: Error Handling - Tool Failure

```bash
npx tsx packages/cli/src/bin.ts run "Read the file /nonexistent/path/file.txt" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY

# Expected:
# - Tool: file_read is called
# - Error result shown in red
# - LLM handles the error gracefully and reports "file not found"
```

### Scenario 12: System Prompt

```bash
npx tsx packages/cli/src/bin.ts run "Who are you?" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY \
  --system-prompt "You are a pirate. Always speak like a pirate."

# Expected:
# - LLM responds in pirate language
```

### Scenario 13: Working Directory Context

```bash
npx tsx packages/cli/src/bin.ts run "List files in the current directory using shell" \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY \
  -d /home

# Expected:
# - shell_exec runs "ls" in /home (not in project dir)
# - Results reflect /home directory contents
```

### Scenario 14: Interactive Chat - Multi-Turn Conversation

```bash
npx tsx packages/cli/src/bin.ts chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY

# Turn 1: "My name is Alice"
# Turn 2: "What is my name?"
# Expected: LLM remembers "Alice" from previous turn
```

### Scenario 15: Chat Commands

```bash
npx tsx packages/cli/src/bin.ts chat \
  -p claude \
  -m claude-sonnet-4-6 \
  -k $ANTHROPIC_API_KEY

# Test each command:
# /help -> shows command list
# /clear -> clears screen
# /exit -> exits
# /quit -> exits
# /q -> exits
```

---

## 3. Registry Pattern Verification

```bash
# In Node REPL or a test script:
npx tsx -e "
import { Registry } from './packages/core/src/index.ts';

const reg = new Registry('Test');
reg.register('a', { value: 1 });
reg.register('b', { value: 2 });

console.log('has a:', reg.has('a'));       // true
console.log('get a:', reg.get('a'));       // { value: 1 }
console.log('size:', reg.size);            // 2
console.log('names:', reg.getAllNames());  // ['a', 'b']

reg.unregister('a');
console.log('after unregister, size:', reg.size); // 1

try { reg.get('a'); } catch(e) { console.log('Error:', e.message); }
// Error: Test 'a' is not registered
"
```

## 4. EventBus Verification

```bash
npx tsx -e "
import { EventBus } from './packages/core/src/index.ts';

const bus = new EventBus();

bus.on('agent:start', (p) => console.log('Started:', p.runId));
bus.once('agent:end', (p) => console.log('Ended:', p.runId, p.reason));

bus.emit('agent:start', { runId: 'run-1' });
bus.emit('agent:end', { runId: 'run-1', reason: 'complete' });
bus.emit('agent:end', { runId: 'run-2', reason: 'error' }); // Should NOT fire (once)

console.log('Listener count:', bus.listenerCount('agent:start')); // 1
console.log('Listener count end:', bus.listenerCount('agent:end')); // 0
"
```

## 5. Config Validation Verification

```bash
npx tsx -e "
import { parseAgentConfig, ConfigError } from './packages/core/src/index.ts';

// Valid config
const config = parseAgentConfig({
  provider: { providerId: 'claude', model: 'test', apiKey: 'sk-123' }
});
console.log('Valid config:', config.provider.providerId, config.maxIterations);

// Invalid config
try {
  parseAgentConfig({});
} catch(e) {
  console.log('Caught:', e.constructor.name, e.message.substring(0, 80));
}

// Invalid provider config
try {
  parseAgentConfig({ provider: { providerId: '', model: '', apiKey: '' } });
} catch(e) {
  console.log('Caught:', e.constructor.name, e.message.substring(0, 80));
}
"
```

## 6. Tool Registry Verification

```bash
npx tsx -e "
import { createToolRegistry } from './packages/tools/src/index.ts';

const registry = createToolRegistry();
console.log('Tools:', registry.getAllNames());
// ['file_read', 'file_write', 'file_search', 'shell_exec']

const fileRead = registry.get('file_read');
console.log('file_read description:', JSON.stringify(fileRead.describe(), null, 2));
console.log('requires permission:', fileRead.requiresPermission); // false

const shellExec = registry.get('shell_exec');
console.log('shell_exec requires permission:', shellExec.requiresPermission); // true
"
```

## 7. Full Agent Loop Mock Test

```bash
npx tsx -e "
import { AgentLoop } from './packages/agent/src/index.ts';
import { Registry } from './packages/core/src/index.ts';

// Mock provider that returns a simple response
const mockProvider = {
  providerId: 'mock',
  chat: async (msgs, tools) => {
    console.log('LLM received', msgs.length, 'messages,', (tools||[]).length, 'tools');
    return {
      content: 'Hello! I am a mock agent.',
      stopReason: 'end_turn',
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5 }
    };
  },
  stream: async function*() {}
};

const agent = new AgentLoop({
  provider: mockProvider,
  toolRegistry: new Registry('Tool'),
  config: {
    provider: { providerId: 'mock', model: 'mock', apiKey: 'mock', maxTokens: 100, temperature: 0 },
    maxIterations: 5,
    workingDirectory: '/tmp'
  }
});

agent.eventBus.on('agent:start', (p) => console.log('EVENT: agent started', p.runId.slice(0,8)));
agent.eventBus.on('agent:end', (p) => console.log('EVENT: agent ended', p.reason));

const result = await agent.run('Hello');
console.log('Result:', result.content);
console.log('Iterations:', result.iterations);
console.log('Aborted:', result.aborted);
"
```

## 8. Error Hierarchy Verification

```bash
npx tsx -e "
import {
  AgentError, RegistryError, ConfigError, ProviderError,
  ToolExecutionError, SandboxError, PermissionDeniedError, AbortError
} from './packages/core/src/index.ts';

const errors = [
  new RegistryError('not found'),
  new ConfigError('bad config'),
  new ProviderError('api down'),
  new ToolExecutionError('file_read', 'failed'),
  new SandboxError('container crash'),
  new PermissionDeniedError('shell_exec'),
  new AbortError(),
];

for (const err of errors) {
  console.log(
    err.constructor.name.padEnd(25),
    'code:', err.code.padEnd(22),
    'instanceof AgentError:', err instanceof AgentError,
    'instanceof Error:', err instanceof Error
  );
}
"
```
