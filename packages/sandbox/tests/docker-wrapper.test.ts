import { describe, it, expect } from 'vitest';
import { DockerSandbox } from '../src/docker-wrapper.js';
import { SandboxError } from '@cli-agent/core';

describe('DockerSandbox', () => {
  it('should create an instance', () => {
    const sandbox = new DockerSandbox();
    expect(sandbox).toBeDefined();
    expect(sandbox.containerId).toBe('');
  });

  it('should implement ISandbox interface', () => {
    const sandbox = new DockerSandbox();
    expect(typeof sandbox.initialize).toBe('function');
    expect(typeof sandbox.execute).toBe('function');
    expect(typeof sandbox.destroy).toBe('function');
  });

  it('should throw SandboxError when executing without initialization', async () => {
    const sandbox = new DockerSandbox();
    await expect(
      sandbox.execute({ code: 'console.log("hi")', language: 'javascript' })
    ).rejects.toThrow(SandboxError);
  });

  it('should not throw when destroying uninitialized sandbox', async () => {
    const sandbox = new DockerSandbox();
    await expect(sandbox.destroy()).resolves.not.toThrow();
  });
});
