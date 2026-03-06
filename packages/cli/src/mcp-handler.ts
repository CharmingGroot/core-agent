import chalk from 'chalk';
import { McpManager, McpConfigStore } from '@cli-agent/tools';
import type { McpServerConfig } from '@cli-agent/tools';

/**
 * Handles /mcp subcommands: connect, disconnect, list, reconnect.
 */
export async function handleMcpCommand(
  content: string,
  mcpManager: McpManager,
  mcpConfigStore: McpConfigStore,
): Promise<void> {
  const parts = content.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  if (!subcommand || subcommand === 'help') {
    printMcpHelp();
    return;
  }

  if (subcommand === 'connect') {
    await handleConnect(parts, mcpManager, mcpConfigStore);
    return;
  }

  if (subcommand === 'disconnect') {
    await handleDisconnect(parts, mcpManager, mcpConfigStore);
    return;
  }

  if (subcommand === 'list') {
    handleList(mcpManager);
    return;
  }

  if (subcommand === 'reconnect') {
    await handleReconnect(parts, mcpManager);
    return;
  }

  console.log(chalk.red(`  Unknown MCP subcommand: ${subcommand}`));
  printMcpHelp();
}

async function handleConnect(
  parts: string[],
  mcpManager: McpManager,
  mcpConfigStore: McpConfigStore,
): Promise<void> {
  const transport = parts[1]?.toLowerCase();

  if (transport === 'stdio') {
    const name = parts[2];
    const command = parts[3];
    const args = parts.slice(4);
    if (!name || !command) {
      console.log(chalk.red('  Usage: /mcp connect stdio <name> <command> [args...]'));
      return;
    }
    const serverConfig: McpServerConfig = { name, transport: 'stdio', command, args };
    try {
      const status = await mcpManager.connect(serverConfig);
      await mcpConfigStore.addServer(serverConfig);
      console.log(chalk.green(`  Connected to "${chalk.cyan(status.name)}" (${chalk.cyan(String(status.toolCount))} tools)`));
      for (const tool of status.tools) {
        console.log(chalk.dim(`    - ${tool}`));
      }
    } catch (err) {
      console.log(chalk.red(`  Failed to connect: ${err instanceof Error ? err.message : String(err)}`));
    }
    return;
  }

  if (transport === 'sse') {
    const name = parts[2];
    const url = parts[3];
    if (!name || !url) {
      console.log(chalk.red('  Usage: /mcp connect sse <name> <url>'));
      return;
    }
    const serverConfig: McpServerConfig = { name, transport: 'sse', url };
    try {
      const status = await mcpManager.connect(serverConfig);
      await mcpConfigStore.addServer(serverConfig);
      console.log(chalk.green(`  Connected to "${chalk.cyan(status.name)}" (${chalk.cyan(String(status.toolCount))} tools)`));
      for (const tool of status.tools) {
        console.log(chalk.dim(`    - ${tool}`));
      }
    } catch (err) {
      console.log(chalk.red(`  Failed to connect: ${err instanceof Error ? err.message : String(err)}`));
    }
    return;
  }

  console.log(chalk.red('  Unknown transport. Usage: /mcp connect stdio|sse ...'));
}

async function handleDisconnect(
  parts: string[],
  mcpManager: McpManager,
  mcpConfigStore: McpConfigStore,
): Promise<void> {
  const name = parts[1];
  if (!name) {
    console.log(chalk.red('  Usage: /mcp disconnect <name>'));
    return;
  }
  try {
    await mcpManager.disconnect(name);
    await mcpConfigStore.removeServer(name);
    console.log(chalk.green(`  Disconnected "${chalk.cyan(name)}"`));
  } catch (err) {
    console.log(chalk.red(`  Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`));
  }
}

function handleList(mcpManager: McpManager): void {
  const servers = mcpManager.getAllStatus();
  if (servers.length === 0) {
    console.log(chalk.dim('  No MCP servers connected.'));
    return;
  }
  console.log(chalk.bold('\n  MCP Servers:'));
  console.log(chalk.dim('  ─────────────────────────────────'));
  for (const server of servers) {
    const stateColor = server.state === 'ready' ? chalk.green : chalk.red;
    console.log(`  ${chalk.cyan(server.name)} [${stateColor(server.state)}] (${server.transport}) — ${chalk.cyan(String(server.toolCount))} tools`);
    for (const tool of server.tools) {
      console.log(chalk.dim(`    - ${tool}`));
    }
  }
  console.log('');
}

async function handleReconnect(
  parts: string[],
  mcpManager: McpManager,
): Promise<void> {
  const name = parts[1];
  if (!name) {
    console.log(chalk.red('  Usage: /mcp reconnect <name>'));
    return;
  }
  try {
    const status = await mcpManager.reconnect(name);
    console.log(chalk.green(`  Reconnected "${chalk.cyan(status.name)}" (${chalk.cyan(String(status.toolCount))} tools)`));
  } catch (err) {
    console.log(chalk.red(`  Failed to reconnect: ${err instanceof Error ? err.message : String(err)}`));
  }
}

export function printMcpHelp(): void {
  console.log(chalk.bold('\n  MCP Commands:'));
  console.log(chalk.dim('  ─────────────────────────────────'));
  console.log('  /mcp list                                  List connected servers');
  console.log('  /mcp connect stdio <name> <cmd> [args...]  Connect stdio server');
  console.log('  /mcp connect sse <name> <url>              Connect SSE server');
  console.log('  /mcp disconnect <name>                     Disconnect a server');
  console.log('  /mcp reconnect <name>                      Reconnect a server');
  console.log('');
}
