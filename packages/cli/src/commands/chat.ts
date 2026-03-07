import type { AgentConfig, ProviderConfig } from '@cli-agent/core';
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
import chalk from 'chalk';

interface MutableConfig {
  providerId: string;
  model: string;
  apiKey: string;
  baseUrl: string | undefined;
  maxTokens: number;
  temperature: number;
  systemPrompt: string | undefined;
  workingDirectory: string;
}

function toMutable(config: AgentConfig): MutableConfig {
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

function toAgentConfig(m: MutableConfig, memory: MemoryManager, soul?: SoulLoader): AgentConfig {
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

  const memCount = memory.list().length;

  console.log(chalk.bold('\nCLI Agent'));
  console.log(chalk.dim(`Provider: ${current.providerId} | Model: ${current.model}`));
  if (soul.isLoaded) {
    console.log(chalk.dim(`Soul: loaded from ${soul.filePath}`));
  }
  if (memCount > 0) {
    console.log(chalk.dim(`Memory: ${memCount} entries loaded from ${memory.filePath}`));
  }
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
        case 'exit': {
          await memory.save();
          renderer.renderInfo('Memory saved. Goodbye!');
          return;
        }

        case 'help': {
          printHelp();
          continue;
        }

        case 'clear': {
          console.clear();
          continue;
        }

        case 'config': {
          printConfig(current, memory, soul);
          continue;
        }

        case 'model': {
          if (!result.content) {
            console.log(chalk.dim(`  Current model: ${chalk.white(current.model)}`));
            console.log(chalk.dim('  Usage: /model <name>'));
            continue;
          }
          current.model = result.content;
          rebuildAgent();
          console.log(chalk.green(`  Model changed to: ${current.model}`));
          continue;
        }

        case 'provider': {
          if (!result.content) {
            console.log(chalk.dim(`  Current provider: ${chalk.white(current.providerId)}`));
            console.log(chalk.dim('  Usage: /provider <id>  (claude, openai)'));
            continue;
          }
          current.providerId = result.content;
          rebuildAgent();
          console.log(chalk.green(`  Provider changed to: ${current.providerId}`));
          continue;
        }

        case 'temperature': {
          if (!result.content) {
            console.log(chalk.dim(`  Current temperature: ${chalk.white(String(current.temperature))}`));
            console.log(chalk.dim('  Usage: /temperature <0~2>'));
            continue;
          }
          const temp = parseFloat(result.content);
          if (isNaN(temp) || temp < 0 || temp > 2) {
            console.log(chalk.red('  Invalid temperature. Must be 0~2.'));
            continue;
          }
          current.temperature = temp;
          rebuildAgent();
          console.log(chalk.green(`  Temperature changed to: ${current.temperature}`));
          continue;
        }

        case 'tokens': {
          if (!result.content) {
            console.log(chalk.dim(`  Current max tokens: ${chalk.white(String(current.maxTokens))}`));
            console.log(chalk.dim('  Usage: /tokens <n>'));
            continue;
          }
          const tokens = parseInt(result.content, 10);
          if (isNaN(tokens) || tokens <= 0) {
            console.log(chalk.red('  Invalid token count. Must be positive integer.'));
            continue;
          }
          current.maxTokens = tokens;
          rebuildAgent();
          console.log(chalk.green(`  Max tokens changed to: ${current.maxTokens}`));
          continue;
        }

        case 'system': {
          if (!result.content) {
            console.log(chalk.dim(`  Current system prompt: ${chalk.white(current.systemPrompt ?? '(none)')}`));
            console.log(chalk.dim('  Usage: /system <prompt text>'));
            continue;
          }
          current.systemPrompt = result.content;
          rebuildAgent();
          console.log(chalk.green('  System prompt updated.'));
          continue;
        }

        case 'memory': {
          const entries = memory.list();
          if (entries.length === 0) {
            console.log(chalk.dim('  No memories stored.'));
          } else {
            console.log(chalk.bold(`\n  Memory (${entries.length} entries):`));
            for (const entry of entries) {
              console.log(chalk.dim(`  - ${entry}`));
            }
            console.log('');
          }
          continue;
        }

        case 'remember': {
          if (!result.content) {
            console.log(chalk.dim('  Usage: /remember <fact to remember>'));
            continue;
          }
          memory.add(result.content);
          await memory.save();
          rebuildAgent();
          console.log(chalk.green(`  Remembered: "${result.content}"`));
          continue;
        }

        case 'forget': {
          if (!result.content) {
            console.log(chalk.dim('  Usage: /forget <keyword>  (removes matching entries)'));
            console.log(chalk.dim('  Usage: /forget all        (clears all memory)'));
            continue;
          }
          if (result.content.toLowerCase() === 'all') {
            memory.clear();
            await memory.save();
            rebuildAgent();
            console.log(chalk.green('  All memories cleared.'));
          } else {
            const removed = memory.remove(result.content);
            await memory.save();
            rebuildAgent();
            if (removed > 0) {
              console.log(chalk.green(`  Removed ${removed} matching entries.`));
            } else {
              console.log(chalk.dim(`  No entries matching "${result.content}".`));
            }
          }
          continue;
        }

        case 'compact': {
          console.log(chalk.dim('  Conversation compacted (agent reset with memory preserved).'));
          rebuildAgent();
          continue;
        }

        case 'soul': {
          if (!result.content) {
            if (soul.isLoaded) {
              console.log(chalk.bold('\n  SOUL.md:'));
              console.log(chalk.dim('  ─────────────────────────────────'));
              const lines = soul.getContent().split('\n');
              for (const line of lines.slice(0, 20)) {
                console.log(chalk.dim(`  ${line}`));
              }
              if (lines.length > 20) {
                console.log(chalk.dim(`  ... +${lines.length - 20} lines`));
              }
              console.log('');
            } else {
              console.log(chalk.dim(`  No SOUL.md found in ${current.workingDirectory}`));
              console.log(chalk.dim('  Usage: /soul init    Create a default SOUL.md'));
              console.log(chalk.dim('  Usage: /soul reload  Reload SOUL.md from disk'));
            }
            continue;
          }
          if (result.content === 'init') {
            const created = await soul.init();
            if (created) {
              rebuildAgent();
              console.log(chalk.green(`  SOUL.md created at ${soul.filePath}`));
              console.log(chalk.dim('  Edit it to customize your agent\'s persona and tone.'));
            } else {
              console.log(chalk.dim(`  SOUL.md already exists at ${soul.filePath}`));
            }
            continue;
          }
          if (result.content === 'reload') {
            await soul.reload();
            rebuildAgent();
            if (soul.isLoaded) {
              console.log(chalk.green('  SOUL.md reloaded.'));
            } else {
              console.log(chalk.dim('  SOUL.md not found or empty.'));
            }
            continue;
          }
          console.log(chalk.dim('  Usage: /soul          Show current soul'));
          console.log(chalk.dim('  Usage: /soul init     Create default SOUL.md'));
          console.log(chalk.dim('  Usage: /soul reload   Reload from disk'));
          continue;
        }

        case 'mcp': {
          await handleMcpCommand(result.content, mcpManager, mcpConfigStore);
          continue;
        }

        case 'message': {
          if (!result.content) continue;

          try {
            const response = await agent.run(result.content);
            // Streaming already wrote content to stdout via llm:stream events;
            // only render if the response had no streamed output (tool-only turns)
            if (response.content && response.iterations <= 1) {
              console.log(''); // newline after streamed output
            }
          } catch (error) {
            renderer.renderError(
              error instanceof Error ? error.message : String(error)
            );
          }
          continue;
        }
      }
    }
  } finally {
    await mcpManager.disconnectAll();
    await memory.save();
    renderer.detach();
    input.close();
  }
}

function printConfig(config: MutableConfig, memory: MemoryManager, soul?: SoulLoader): void {
  console.log(chalk.bold('\n  Current Configuration:'));
  console.log(chalk.dim('  ─────────────────────────────────'));
  console.log(`  Provider:     ${chalk.white(config.providerId)}`);
  console.log(`  Model:        ${chalk.white(config.model)}`);
  console.log(`  API Key:      ${chalk.white(config.apiKey.slice(0, 8) + '...')}`);
  if (config.baseUrl) {
    console.log(`  Base URL:     ${chalk.white(config.baseUrl)}`);
  }
  console.log(`  Max Tokens:   ${chalk.white(String(config.maxTokens))}`);
  console.log(`  Temperature:  ${chalk.white(String(config.temperature))}`);
  console.log(`  System:       ${chalk.white(config.systemPrompt ?? '(none)')}`);
  console.log(`  Working Dir:  ${chalk.white(config.workingDirectory)}`);
  console.log(`  Soul:         ${chalk.white(soul?.isLoaded ? 'loaded' : '(none)')}`);
  console.log(`  Memory:       ${chalk.white(`${memory.list().length} entries`)}`);
  console.log('');
}

function printHelp(): void {
  console.log(chalk.bold('\n  Available Commands:'));
  console.log(chalk.dim('  ─────────────────────────────────'));
  console.log('');
  console.log(chalk.bold('  General'));
  console.log('  /help, /h           Show this help');
  console.log('  /clear              Clear the screen');
  console.log('  /exit, /quit, /q    Exit the agent');
  console.log('');
  console.log(chalk.bold('  Configuration'));
  console.log('  /config             Show current config');
  console.log('  /model <name>       Change model (e.g. /model gpt-4o)');
  console.log('  /provider <id>      Change provider (claude, openai)');
  console.log('  /temperature <n>    Change temperature (0~2)');
  console.log('  /tokens <n>         Change max tokens');
  console.log('  /system <text>      Change system prompt');
  console.log('');
  console.log(chalk.bold('  Memory'));
  console.log('  /memory             Show saved memories');
  console.log('  /remember <text>    Save a fact to memory');
  console.log('  /forget <keyword>   Remove matching memories');
  console.log('  /forget all         Clear all memories');
  console.log('  /compact            Reset conversation (keep memory)');
  console.log('');
  console.log(chalk.bold('  Persona'));
  console.log('  /soul               Show current SOUL.md');
  console.log('  /soul init          Create default SOUL.md');
  console.log('  /soul reload        Reload SOUL.md from disk');
  console.log('');
  console.log(chalk.bold('  MCP (Model Context Protocol)'));
  console.log('  /mcp list           List connected MCP servers');
  console.log('  /mcp connect stdio  Connect a stdio MCP server');
  console.log('  /mcp connect sse    Connect an SSE MCP server');
  console.log('  /mcp disconnect     Disconnect an MCP server');
  console.log('  /mcp reconnect      Reconnect an MCP server');
  console.log('');
}
