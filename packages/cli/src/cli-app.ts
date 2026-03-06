import { Command } from 'commander';
import { parseAgentConfig } from '@cli-agent/core';
import type { AgentConfig } from '@cli-agent/core';
import { chatCommand } from './commands/chat.js';
import { runCommand } from './commands/run.js';

const DEFAULT_CONFIG_PARTIAL = {
  maxIterations: 50,
  workingDirectory: process.cwd(),
};

export function createCliApp(): Command {
  const program = new Command();

  program
    .name('cli-agent')
    .description('Interactive CLI agent with multi-LLM support')
    .version('0.0.1');

  program
    .command('chat')
    .description('Start an interactive chat session')
    .requiredOption('-p, --provider <id>', 'LLM provider (claude, openai)')
    .requiredOption('-m, --model <name>', 'Model name')
    .requiredOption('-k, --api-key <key>', 'API key')
    .option('-u, --base-url <url>', 'API base URL')
    .option('--max-tokens <n>', 'Max tokens per response', '4096')
    .option('--temperature <n>', 'Temperature', '0.7')
    .option('--system-prompt <text>', 'System prompt')
    .option('-d, --directory <path>', 'Working directory', process.cwd())
    .action(async (opts) => {
      const config = buildConfig(opts);
      await chatCommand(config);
    });

  program
    .command('run')
    .description('Run a single message and exit')
    .argument('<message>', 'Message to send')
    .requiredOption('-p, --provider <id>', 'LLM provider (claude, openai)')
    .requiredOption('-m, --model <name>', 'Model name')
    .requiredOption('-k, --api-key <key>', 'API key')
    .option('-u, --base-url <url>', 'API base URL')
    .option('--max-tokens <n>', 'Max tokens per response', '4096')
    .option('--temperature <n>', 'Temperature', '0.7')
    .option('--system-prompt <text>', 'System prompt')
    .option('-d, --directory <path>', 'Working directory', process.cwd())
    .action(async (message: string, opts) => {
      const config = buildConfig(opts);
      await runCommand({ config, message });
    });

  return program;
}

function buildConfig(opts: Record<string, string>): AgentConfig {
  return parseAgentConfig({
    provider: {
      providerId: opts['provider'],
      model: opts['model'],
      apiKey: opts['apiKey'],
      baseUrl: opts['baseUrl'],
      maxTokens: parseInt(opts['maxTokens'] ?? '4096', 10),
      temperature: parseFloat(opts['temperature'] ?? '0.7'),
    },
    maxIterations: DEFAULT_CONFIG_PARTIAL.maxIterations,
    systemPrompt: opts['systemPrompt'],
    workingDirectory: opts['directory'] ?? DEFAULT_CONFIG_PARTIAL.workingDirectory,
  });
}
