import chalk from 'chalk';
import type { MemoryManager } from '../memory-manager.js';
import type { SoulLoader } from '../soul-loader.js';

export interface DisplayConfig {
  providerId: string;
  model: string;
  apiKey: string;
  baseUrl: string | undefined;
  maxTokens: number;
  temperature: number;
  systemPrompt: string | undefined;
  workingDirectory: string;
}

export function printConfig(config: DisplayConfig, memory: MemoryManager, soul?: SoulLoader): void {
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

export function printHelp(): void {
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
