import { describe, it, expect } from 'vitest';
import { createCliApp } from '../src/cli-app.js';
import { COMMAND_MAP } from '../src/input-handler.js';

describe('CLI App', () => {
  it('should create a Commander program', () => {
    const app = createCliApp();
    expect(app).toBeDefined();
    expect(app.name()).toBe('cli-agent');
  });

  it('should have chat command', () => {
    const app = createCliApp();
    const chatCmd = app.commands.find((c) => c.name() === 'chat');
    expect(chatCmd).toBeDefined();
  });

  it('should have run command', () => {
    const app = createCliApp();
    const runCmd = app.commands.find((c) => c.name() === 'run');
    expect(runCmd).toBeDefined();
  });

  it('should have version set', () => {
    const app = createCliApp();
    expect(app.version()).toBe('0.0.1');
  });

  it('chat command should have required options', () => {
    const app = createCliApp();
    const chatCmd = app.commands.find((c) => c.name() === 'chat')!;
    const optionNames = chatCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--provider');
    expect(optionNames).toContain('--model');
    expect(optionNames).toContain('--api-key');
  });

  it('run command should have required options', () => {
    const app = createCliApp();
    const runCmd = app.commands.find((c) => c.name() === 'run')!;
    const optionNames = runCmd.options.map((o) => o.long);
    expect(optionNames).toContain('--provider');
    expect(optionNames).toContain('--model');
    expect(optionNames).toContain('--api-key');
  });
});

describe('MCP slash command integration', () => {
  it('should recognize /mcp as mcp input type', () => {
    expect(COMMAND_MAP['/mcp']).toBe('mcp');
  });

  it('should parse /mcp list with content extraction logic', () => {
    // Simulate the parsing logic from InputHandler.prompt
    const input = '/mcp list';
    const spaceIdx = input.indexOf(' ');
    const cmd = spaceIdx === -1 ? input.toLowerCase() : input.slice(0, spaceIdx).toLowerCase();
    const arg = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1).trim();

    const type = COMMAND_MAP[cmd];
    expect(type).toBe('mcp');
    expect(arg).toBe('list');
  });

  it('should parse /mcp connect stdio with arguments', () => {
    const input = '/mcp connect stdio my-server npx some-tool';
    const spaceIdx = input.indexOf(' ');
    const cmd = input.slice(0, spaceIdx).toLowerCase();
    const arg = input.slice(spaceIdx + 1).trim();

    expect(COMMAND_MAP[cmd]).toBe('mcp');
    expect(arg).toBe('connect stdio my-server npx some-tool');

    // Verify subcommand parsing
    const parts = arg.split(/\s+/);
    expect(parts[0]).toBe('connect');
    expect(parts[1]).toBe('stdio');
    expect(parts[2]).toBe('my-server');
    expect(parts[3]).toBe('npx');
    expect(parts[4]).toBe('some-tool');
  });
});
