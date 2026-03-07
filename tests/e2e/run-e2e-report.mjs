/**
 * E2E Test Runner with Detailed Report
 * 각 테스트의 요청/응답을 상세히 기록한다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

// ── .env 로드 ──
async function loadEnv() {
  try {
    const content = await readFile(join(ROOT, '.env'), 'utf-8');
    const env = {};
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
    return env;
  } catch { return {}; }
}

// ── 동적 import (빌드된 패키지 사용, Windows file:// 필수) ──
import { pathToFileURL } from 'node:url';
const toURL = (p) => pathToFileURL(p).href;
const { AgentLoop } = await import(toURL(join(ROOT, 'packages/agent/dist/index.js')));
const { OpenAIProvider, ClaudeProvider } = await import(toURL(join(ROOT, 'packages/providers/dist/index.js')));
const { createToolRegistry, registerGitTools } = await import(toURL(join(ROOT, 'packages/tools/dist/index.js')));
const { Registry, EventBus, apiKeyAuth } = await import(toURL(join(ROOT, 'packages/core/dist/index.js')));

const env = await loadEnv();
const report = [];
const startedAt = new Date();

function log(msg) {
  console.log(msg);
  report.push(msg);
}

function separator() {
  log('─'.repeat(80));
}

function formatDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

// ── 테스트 러너 ──
async function runTest(name, fn) {
  separator();
  log(`\n🧪 TEST: ${name}`);
  log(`   시작: ${new Date().toISOString()}`);
  const t0 = Date.now();
  try {
    await fn();
    const elapsed = Date.now() - t0;
    log(`   ✅ PASS (${formatDuration(elapsed)})`);
    return { name, status: 'PASS', elapsed };
  } catch (err) {
    const elapsed = Date.now() - t0;
    log(`   ❌ FAIL (${formatDuration(elapsed)}): ${err.message}`);
    return { name, status: 'FAIL', elapsed, error: err.message };
  }
}

function buildConfig(providerConfig, maxIter = 5) {
  return {
    provider: providerConfig,
    maxIterations: maxIter,
    systemPrompt: 'You are a helpful assistant. Be concise.',
    workingDirectory: ROOT,
  };
}

// ── 이벤트 로깅 헬퍼 ──
function attachEventLogger(eventBus, testLog) {
  eventBus.on('agent:start', (p) => testLog.push({ event: 'agent:start', runId: p.runId }));
  eventBus.on('agent:end', (p) => testLog.push({ event: 'agent:end', runId: p.runId, reason: p.reason }));
  eventBus.on('llm:request', (p) => {
    const msgs = p.messages.map(m => ({
      role: m.role,
      content: m.content?.slice(0, 300) + (m.content?.length > 300 ? '...' : ''),
      toolCalls: m.toolCalls?.map(tc => tc.name),
      toolResults: m.toolResults?.map(tr => ({ id: tr.toolCallId, content: tr.content?.slice(0, 200) })),
    }));
    testLog.push({ event: 'llm:request', messageCount: p.messages.length, messages: msgs });
  });
  eventBus.on('llm:response', (p) => {
    testLog.push({
      event: 'llm:response',
      content: p.response.content?.slice(0, 500),
      stopReason: p.response.stopReason,
      toolCalls: p.response.toolCalls?.map(tc => ({ id: tc.id, name: tc.name, args: tc.arguments?.slice(0, 200) })),
      usage: p.response.usage,
    });
  });
  eventBus.on('tool:start', (p) => {
    testLog.push({ event: 'tool:start', tool: p.toolCall.name, args: p.toolCall.arguments?.slice(0, 200) });
  });
  eventBus.on('tool:end', (p) => {
    testLog.push({
      event: 'tool:end',
      tool: p.toolCall.name,
      success: p.result.success,
      output: p.result.output?.slice(0, 300) + (p.result.output?.length > 300 ? '...' : ''),
      error: p.result.error,
    });
  });
}

function printEventLog(testLog) {
  for (const entry of testLog) {
    switch (entry.event) {
      case 'agent:start':
        log(`   📌 Agent 시작 (runId: ${entry.runId})`);
        break;
      case 'llm:request':
        log(`   📤 LLM 요청 (메시지 ${entry.messageCount}개)`);
        for (const m of entry.messages) {
          if (m.role === 'system') {
            log(`      [system] ${m.content}`);
          } else if (m.role === 'user' && m.toolResults) {
            log(`      [user/tool-results]`);
            for (const tr of m.toolResults) {
              log(`        ↳ ${tr.id}: ${tr.content}`);
            }
          } else if (m.role === 'user') {
            log(`      [user] ${m.content}`);
          } else if (m.role === 'assistant') {
            log(`      [assistant] ${m.content}`);
            if (m.toolCalls) log(`        ↳ tool_calls: ${m.toolCalls.join(', ')}`);
          }
        }
        break;
      case 'llm:response':
        log(`   📥 LLM 응답 (stopReason: ${entry.stopReason}, tokens: in=${entry.usage?.inputTokens} out=${entry.usage?.outputTokens})`);
        log(`      content: ${entry.content}`);
        if (entry.toolCalls?.length) {
          for (const tc of entry.toolCalls) {
            log(`      🔧 tool_call: ${tc.name}(${tc.args})`);
          }
        }
        break;
      case 'tool:start':
        log(`   ⚙️  Tool 실행: ${entry.tool}(${entry.args})`);
        break;
      case 'tool:end':
        log(`   ${entry.success ? '✅' : '❌'} Tool 결과: ${entry.tool}`);
        log(`      output: ${entry.output}`);
        if (entry.error) log(`      error: ${entry.error}`);
        break;
      case 'agent:end':
        log(`   🏁 Agent 종료 (reason: ${entry.reason})`);
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 테스트 실행
// ═══════════════════════════════════════════════════════════════════

log('╔══════════════════════════════════════════════════════════════════════╗');
log('║              CLI Agent Core — E2E 테스트 보고서                      ║');
log(`║  실행일시: ${startedAt.toISOString().padEnd(55)}║`);
log('╚══════════════════════════════════════════════════════════════════════╝');
log('');
log(`환경:`);
log(`  Node: ${process.version}`);
log(`  Platform: ${process.platform}`);
log(`  ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? '설정됨 (' + env.ANTHROPIC_API_KEY.slice(0, 10) + '...)' : '❌ 미설정'}`);
log(`  OPENAI_API_KEY: ${env.OPENAI_API_KEY ? '설정됨 (' + env.OPENAI_API_KEY.slice(0, 10) + '...)' : '❌ 미설정'}`);

const results = [];

// ── Test 1: OpenAI 단순 응답 ──
if (env.OPENAI_API_KEY) {
  results.push(await runTest('OpenAI 단순 응답 (gpt-4o-mini)', async () => {
    const testLog = [];
    const providerConfig = {
      providerId: 'openai', model: 'gpt-4o-mini',
      auth: apiKeyAuth(env.OPENAI_API_KEY), maxTokens: 1024, temperature: 0,
    };
    const provider = new OpenAIProvider(providerConfig);
    const eventBus = new EventBus();
    attachEventLogger(eventBus, testLog);

    const agent = new AgentLoop({
      provider, toolRegistry: new Registry('Tool'),
      config: buildConfig(providerConfig, 3), eventBus,
    });
    const result = await agent.run('What is 2+2? Reply with just the number.');

    printEventLog(testLog);
    log(`\n   📊 결과:`);
    log(`      content: "${result.content}"`);
    log(`      iterations: ${result.iterations}`);
    log(`      aborted: ${result.aborted}`);
    log(`      runId: ${result.runId}`);

    if (!result.content.includes('4')) throw new Error(`Expected "4" in response, got: ${result.content}`);
  }));
}

// ── Test 2: Claude 단순 응답 ──
if (env.ANTHROPIC_API_KEY) {
  results.push(await runTest('Claude 단순 응답 (claude-sonnet)', async () => {
    const testLog = [];
    const providerConfig = {
      providerId: 'claude', model: 'claude-sonnet-4-20250514',
      auth: apiKeyAuth(env.ANTHROPIC_API_KEY), maxTokens: 1024, temperature: 0,
    };
    const provider = new ClaudeProvider(providerConfig);
    const eventBus = new EventBus();
    attachEventLogger(eventBus, testLog);

    const agent = new AgentLoop({
      provider, toolRegistry: new Registry('Tool'),
      config: buildConfig(providerConfig, 3), eventBus,
    });
    const result = await agent.run('What is 2+2? Reply with just the number.');

    printEventLog(testLog);
    log(`\n   📊 결과:`);
    log(`      content: "${result.content}"`);
    log(`      iterations: ${result.iterations}`);
    log(`      runId: ${result.runId}`);

    if (!result.content.includes('4')) throw new Error(`Expected "4" in response, got: ${result.content}`);
  }));
} else {
  log('\n⏭️  SKIP: Claude 단순 응답 — ANTHROPIC_API_KEY 미설정');
}

// ── Test 3: Tool 실행 (file_read) ──
const apiKey3 = env.ANTHROPIC_API_KEY ?? env.OPENAI_API_KEY;
if (apiKey3) {
  const isAnthropic3 = Boolean(env.ANTHROPIC_API_KEY);
  results.push(await runTest(`Tool 실행 — file_read (${isAnthropic3 ? 'Claude' : 'OpenAI'})`, async () => {
    const testLog = [];
    const providerConfig = isAnthropic3
      ? { providerId: 'claude', model: 'claude-sonnet-4-20250514', auth: apiKeyAuth(apiKey3), maxTokens: 1024, temperature: 0 }
      : { providerId: 'openai', model: 'gpt-4o-mini', auth: apiKeyAuth(apiKey3), maxTokens: 1024, temperature: 0 };
    const provider = isAnthropic3 ? new ClaudeProvider(providerConfig) : new OpenAIProvider(providerConfig);
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    attachEventLogger(eventBus, testLog);

    const agent = new AgentLoop({
      provider, toolRegistry,
      config: buildConfig(providerConfig, 10), eventBus,
    });
    const result = await agent.run('Read the file "package.json" in the current directory and tell me the project name.');

    printEventLog(testLog);
    log(`\n   📊 결과:`);
    log(`      content: "${result.content.slice(0, 500)}"`);
    log(`      iterations: ${result.iterations}`);

    const toolNames = testLog.filter(e => e.event === 'tool:start').map(e => e.tool);
    log(`      사용된 도구: [${toolNames.join(', ')}]`);

    if (!toolNames.includes('file_read')) throw new Error('file_read tool was not called');
    if (!result.content.toLowerCase().includes('cli-agent-core')) throw new Error('Expected project name in response');
  }));
}

// ── Test 4: Multi-tool 반복 실행 ──
const apiKey4 = env.ANTHROPIC_API_KEY ?? env.OPENAI_API_KEY;
if (apiKey4) {
  const isAnthropic4 = Boolean(env.ANTHROPIC_API_KEY);
  results.push(await runTest(`Multi-tool 반복 — file_search + file_read (${isAnthropic4 ? 'Claude' : 'OpenAI'})`, async () => {
    const testLog = [];
    const providerConfig = isAnthropic4
      ? { providerId: 'claude', model: 'claude-sonnet-4-20250514', auth: apiKeyAuth(apiKey4), maxTokens: 1024, temperature: 0 }
      : { providerId: 'openai', model: 'gpt-4o-mini', auth: apiKeyAuth(apiKey4), maxTokens: 1024, temperature: 0 };
    const provider = isAnthropic4 ? new ClaudeProvider(providerConfig) : new OpenAIProvider(providerConfig);
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    attachEventLogger(eventBus, testLog);

    const agent = new AgentLoop({
      provider, toolRegistry,
      config: buildConfig(providerConfig, 10), eventBus,
    });
    const result = await agent.run(
      'Search for files matching "**/vitest.config.ts" under the packages directory, then read one of them and tell me what test framework it uses.'
    );

    printEventLog(testLog);
    log(`\n   📊 결과:`);
    log(`      content: "${result.content.slice(0, 500)}"`);
    log(`      iterations: ${result.iterations}`);

    const toolNames = testLog.filter(e => e.event === 'tool:start').map(e => e.tool);
    log(`      사용된 도구: [${toolNames.join(', ')}]`);
    log(`      총 도구 호출: ${toolNames.length}회`);

    if (toolNames.length < 1) throw new Error('Expected at least 1 tool call');
    if (!result.content.toLowerCase().includes('vitest')) throw new Error('Expected "vitest" in response');
  }));
}

// ── Test 5: Abort ──
const apiKey5 = env.ANTHROPIC_API_KEY ?? env.OPENAI_API_KEY;
if (apiKey5) {
  const isAnthropic5 = Boolean(env.ANTHROPIC_API_KEY);
  results.push(await runTest(`Abort 시그널 (${isAnthropic5 ? 'Claude' : 'OpenAI'})`, async () => {
    const testLog = [];
    const providerConfig = isAnthropic5
      ? { providerId: 'claude', model: 'claude-sonnet-4-20250514', auth: apiKeyAuth(apiKey5), maxTokens: 1024, temperature: 0 }
      : { providerId: 'openai', model: 'gpt-4o-mini', auth: apiKeyAuth(apiKey5), maxTokens: 1024, temperature: 0 };
    const provider = isAnthropic5 ? new ClaudeProvider(providerConfig) : new OpenAIProvider(providerConfig);
    const toolRegistry = createToolRegistry();
    const eventBus = new EventBus();
    attachEventLogger(eventBus, testLog);

    const agent = new AgentLoop({
      provider, toolRegistry,
      config: buildConfig(providerConfig, 10), eventBus,
    });

    const runPromise = agent.run(
      'List every file in the current directory recursively, read each one, and summarize the entire codebase.'
    );
    setTimeout(() => {
      log('   🛑 abort() 호출');
      agent.abort('test abort');
    }, 100);

    try {
      const result = await runPromise;
      printEventLog(testLog);
      log(`\n   📊 결과: 첫 iteration 완료 후 abort 감지`);
      log(`      content: "${result.content?.slice(0, 200)}"`);
      log(`      iterations: ${result.iterations}`);
      log(`      aborted: ${result.aborted}`);
    } catch (err) {
      printEventLog(testLog);
      log(`\n   📊 결과: AbortError 발생 (정상)`);
      log(`      error: ${err.message}`);
    }
  }));
}

// ── Test 6: Git 도구 (git_status + git_log) ──
const apiKey6 = env.ANTHROPIC_API_KEY ?? env.OPENAI_API_KEY;
if (apiKey6) {
  const isAnthropic6 = Boolean(env.ANTHROPIC_API_KEY);
  results.push(await runTest(`Git 도구 — git_status + git_log (${isAnthropic6 ? 'Claude' : 'OpenAI'})`, async () => {
    const testLog = [];
    const providerConfig = isAnthropic6
      ? { providerId: 'claude', model: 'claude-sonnet-4-20250514', auth: apiKeyAuth(apiKey6), maxTokens: 1024, temperature: 0 }
      : { providerId: 'openai', model: 'gpt-4o-mini', auth: apiKeyAuth(apiKey6), maxTokens: 1024, temperature: 0 };
    const provider = isAnthropic6 ? new ClaudeProvider(providerConfig) : new OpenAIProvider(providerConfig);
    const toolRegistry = createToolRegistry();
    registerGitTools(toolRegistry);
    const eventBus = new EventBus();
    attachEventLogger(eventBus, testLog);

    const agent = new AgentLoop({
      provider, toolRegistry,
      config: buildConfig(providerConfig, 10), eventBus,
    });
    const result = await agent.run(
      'Check the current git status and show me the last 3 commits. Summarize what you see.'
    );

    printEventLog(testLog);
    log(`\n   📊 결과:`);
    log(`      content: "${result.content.slice(0, 500)}"`);
    log(`      iterations: ${result.iterations}`);

    const toolNames = testLog.filter(e => e.event === 'tool:start').map(e => e.tool);
    log(`      사용된 도구: [${toolNames.join(', ')}]`);

    if (!toolNames.some(n => n.startsWith('git_'))) throw new Error('No git tools were called');
  }));
}

// ═══════════════════════════════════════════════════════════════════
// 요약
// ═══════════════════════════════════════════════════════════════════
separator();
log('');
log('╔══════════════════════════════════════════════════════════════════════╗');
log('║                         테스트 요약                                  ║');
log('╚══════════════════════════════════════════════════════════════════════╝');
log('');
const totalElapsed = Date.now() - startedAt.getTime();
for (const r of results) {
  log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.name} — ${formatDuration(r.elapsed)}${r.error ? ' (' + r.error + ')' : ''}`);
}
log('');
log(`  총 ${results.length}개 실행, ${results.filter(r => r.status === 'PASS').length}개 통과, ${results.filter(r => r.status === 'FAIL').length}개 실패`);
log(`  총 소요시간: ${formatDuration(totalElapsed)}`);
log('');

// 보고서 파일 저장
const reportPath = join(ROOT, 'tests', 'e2e', `e2e-report-${startedAt.toISOString().slice(0, 10)}.md`);
const mdReport = `# E2E 테스트 보고서\n\n**실행일시:** ${startedAt.toISOString()}\n\n\`\`\`\n${report.join('\n')}\n\`\`\`\n`;
await writeFile(reportPath, mdReport, 'utf-8');
log(`📄 보고서 저장: ${reportPath}`);
