import type { AgentConfig } from '@cli-agent/core';
import { EventBus, parseAgentConfig } from '@cli-agent/core';
import { createProvider } from '@cli-agent/providers';
import { createToolRegistry } from '@cli-agent/tools';
import { McpManager, McpConfigStore } from '@cli-agent/external-tools';
import { AgentLoop } from '@cli-agent/agent';
import { CliRenderer } from '../renderer.js';
import { InputHandler } from '../input-handler.js';
import { MemoryManager } from '../memory-manager.js';
import { SoulLoader } from '../soul-loader.js';
import { handleMcpCommand } from '../mcp-handler.js';
import { printConfig, printHelp, type DisplayConfig } from './chat-ui.js';
import chalk from 'chalk';

function toMutable(config: AgentConfig): DisplayConfig {
  const auth = config.provider.auth;
  const apiKey = auth.type === 'api-key' ? auth.apiKey : '';
  return {
    providerId: config.provider.providerId,
    model: config.provider.model,
    apiKey,
    baseUrl: config.provider.baseUrl,
    maxTokens: config.provider.maxTokens,
    temperature: config.provider.temperature,
    systemPrompt: config.systemPrompt,
    workingDirectory: config.workingDirectory,
  };
}

function toAgentConfig(m: DisplayConfig, memory: MemoryManager, soul?: SoulLoader): AgentConfig {
  const soulPrompt = soul?.toSystemPrompt() ?? '';
  const memoryPrompt = memory.toSystemPrompt();
  const parts = [soulPrompt, m.systemPrompt ?? '', memoryPrompt].filter(Boolean);
  const systemPrompt = parts.length > 0 ? parts.join('\n') : undefined;

  return parseAgentConfig({
    provider: {
      providerId: m.providerId,
      model: m.model,
      auth: { type: 'api-key', apiKey: m.apiKey },
      baseUrl: m.baseUrl,
      maxTokens: m.maxTokens,
      temperature: m.temperature,
    },
    systemPrompt,
    workingDirectory: m.workingDirectory,
    maxIterations: 50,
  });
}

function createAgent(
  config: AgentConfig,
  eventBus: EventBus,
  toolRegistry: ReturnType<typeof createToolRegistry>,
): AgentLoop {
  const provider = createProvider(config.provider);
  return new AgentLoop({ provider, toolRegistry, config, eventBus, streaming: true });
}

export async function chatCommand(config: AgentConfig): Promise<void> {
  const eventBus = new EventBus();
  const renderer = new CliRenderer(eventBus);
  renderer.attach();

  const input = new InputHandler();
  input.start();

  const current = toMutable(config);
  const memory = new MemoryManager(current.workingDirectory);
  await memory.load();
  const soul = new SoulLoader(current.workingDirectory);
  await soul.load();

  const toolRegistry = createToolRegistry();
  const mcpManager = new McpManager(toolRegistry, eventBus);
  const mcpConfigStore = new McpConfigStore();

  // Auto-connect saved MCP servers
  const savedMcpConfigs = await mcpConfigStore.load();
  for (const serverConfig of savedMcpConfigs) {
    try {
      const status = await mcpManager.connect(serverConfig);
      console.log(chalk.green(`  MCP: auto-connected "${status.name}" (${chalk.cyan(String(status.toolCount))} tools)`));
    } catch (err) {
      console.log(chalk.red(`  MCP: failed to auto-connect "${serverConfig.name}": ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  let agentConfig = toAgentConfig(current, memory, soul);
  let agent = createAgent(agentConfig, eventBus, toolRegistry);

  console.log(chalk.bold('\nCLI Agent'));
  console.log(chalk.dim(`Provider: ${current.providerId} | Model: ${current.model}`));
  if (soul.isLoaded) console.log(chalk.dim(`Soul: loaded from ${soul.filePath}`));
  const memCount = memory.list().length;
  if (memCount > 0) console.log(chalk.dim(`Memory: ${memCount} entries loaded from ${memory.filePath}`));
  console.log(chalk.dim('Type /help for commands, /exit to quit\n'));
  if (!soul.isLoaded) {
    console.log(chalk.yellow('  Tip: No SOUL.md found. Personalize your agent with /soul init'));
    console.log(chalk.dim('  Edit SOUL.md to set persona, tone, and behavior rules.\n'));
  }

  function rebuildAgent(): void {
    agentConfig = toAgentConfig(current, memory, soul);
    agent = createAgent(agentConfig, eventBus, toolRegistry);
  }

  try {
    while (true) {
      const result = await input.prompt();

      switch (result.type) {
        case 'exit':
          await memory.save();
          renderer.renderInfo('Memory saved. Goodbye!');
          return;
        case 'help':
          printHelp();
          continue;
        case 'clear':
          console.clear();
          continue;
        case 'config':
          printConfig(current, memory, soul);
          continue;
        case 'model':
          if (!result.content) { console.log(chalk.dim(`  Current: ${current.model}. Usage: /model <name>`)); continue; }
          current.model = result.content; rebuildAgent();
          console.log(chalk.green(`  Model changed to: ${current.model}`));
          continue;
        case 'provider':
          if (!result.content) { console.log(chalk.dim(`  Current: ${current.providerId}. Usage: /provider <id>`)); continue; }
          current.providerId = result.content; rebuildAgent();
          console.log(chalk.green(`  Provider changed to: ${current.providerId}`));
          continue;
        case 'temperature':
          if (!result.content) { console.log(chalk.dim(`  Current: ${current.temperature}. Usage: /temperature <0~2>`)); continue; }
          { const t = parseFloat(result.content);
            if (isNaN(t) || t < 0 || t > 2) { console.log(chalk.red('  Invalid temperature. Must be 0~2.')); continue; }
            current.temperature = t; rebuildAgent();
            console.log(chalk.green(`  Temperature changed to: ${current.temperature}`)); }
          continue;
        case 'tokens':
          if (!result.content) { console.log(chalk.dim(`  Current: ${current.maxTokens}. Usage: /tokens <n>`)); continue; }
          { const n = parseInt(result.content, 10);
            if (isNaN(n) || n <= 0) { console.log(chalk.red('  Invalid. Must be positive integer.')); continue; }
            current.maxTokens = n; rebuildAgent();
            console.log(chalk.green(`  Max tokens changed to: ${current.maxTokens}`)); }
          continue;
        case 'system':
          if (!result.content) { console.log(chalk.dim(`  Current: ${current.systemPrompt ?? '(none)'}. Usage: /system <text>`)); continue; }
          current.systemPrompt = result.content; rebuildAgent();
          console.log(chalk.green('  System prompt updated.'));
          continue;
        case 'memory':
          { const entries = memory.list();
            if (entries.length === 0) { console.log(chalk.dim('  No memories stored.')); }
            else { console.log(chalk.bold(`\n  Memory (${entries.length}):`));
              for (const e of entries) console.log(chalk.dim(`  - ${e}`));
              console.log(''); } }
          continue;
        case 'remember':
          if (!result.content) { console.log(chalk.dim('  Usage: /remember <fact>')); continue; }
          memory.add(result.content); await memory.save(); rebuildAgent();
          console.log(chalk.green(`  Remembered: "${result.content}"`));
          continue;
        case 'forget':
          if (!result.content) { console.log(chalk.dim('  Usage: /forget <keyword> or /forget all')); continue; }
          if (result.content.toLowerCase() === 'all') {
            memory.clear(); await memory.save(); rebuildAgent();
            console.log(chalk.green('  All memories cleared.'));
          } else {
            const removed = memory.remove(result.content); await memory.save(); rebuildAgent();
            console.log(removed > 0 ? chalk.green(`  Removed ${removed} entries.`) : chalk.dim(`  No match for "${result.content}".`));
          }
          continue;
        case 'compact':
          rebuildAgent();
          console.log(chalk.dim('  Conversation compacted (agent reset with memory preserved).'));
          continue;
        case 'soul':
          await handleSoulCommand(result.content, soul, rebuildAgent, current.workingDirectory);
          continue;
        case 'mcp':
          await handleMcpCommand(result.content, mcpManager, mcpConfigStore);
          continue;
        case 'message':
          if (!result.content) continue;
          try {
            const response = await agent.run(result.content);
            if (response.content && response.iterations <= 1) console.log('');
          } catch (error) {
            renderer.renderError(error instanceof Error ? error.message : String(error));
          }
          continue;
      }
    }
  } finally {
    await mcpManager.disconnectAll();
    await memory.save();
    renderer.detach();
    input.close();
  }
}

async function handleSoulCommand(
  content: string | undefined,
  soul: SoulLoader,
  rebuildAgent: () => void,
  workingDirectory: string,
): Promise<void> {
  if (!content) {
    if (soul.isLoaded) {
      console.log(chalk.bold('\n  SOUL.md:'));
      console.log(chalk.dim('  ─────────────────────────────────'));
      const lines = soul.getContent().split('\n');
      for (const line of lines.slice(0, 20)) console.log(chalk.dim(`  ${line}`));
      if (lines.length > 20) console.log(chalk.dim(`  ... +${lines.length - 20} lines`));
      console.log('');
    } else {
      console.log(chalk.dim(`  No SOUL.md found in ${workingDirectory}`));
      console.log(chalk.dim('  /soul init — Create default  |  /soul reload — Reload from disk'));
    }
    return;
  }
  if (content === 'init') {
    const created = await soul.init();
    if (created) {
      rebuildAgent();
      console.log(chalk.green(`  SOUL.md created at ${soul.filePath}`));
    } else {
      console.log(chalk.dim(`  SOUL.md already exists at ${soul.filePath}`));
    }
    return;
  }
  if (content === 'reload') {
    await soul.reload();
    rebuildAgent();
    console.log(soul.isLoaded ? chalk.green('  SOUL.md reloaded.') : chalk.dim('  SOUL.md not found or empty.'));
    return;
  }
  console.log(chalk.dim('  Usage: /soul | /soul init | /soul reload'));
}
