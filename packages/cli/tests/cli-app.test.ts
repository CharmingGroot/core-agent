import { describe, it, expect } from 'vitest';
import { createCliApp } from '../src/cli-app.js';

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
