import { describe, it, expect } from 'vitest';
import { SandboxManager } from '../src/sandbox-manager.js';

describe('SandboxManager', () => {
  it('should create an instance', () => {
    const manager = new SandboxManager();
    expect(manager).toBeDefined();
    expect(manager.poolSize).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  it('should have initialize method', () => {
    const manager = new SandboxManager();
    expect(typeof manager.initialize).toBe('function');
  });

  it('should have acquire method', () => {
    const manager = new SandboxManager();
    expect(typeof manager.acquire).toBe('function');
  });

  it('should have release method', () => {
    const manager = new SandboxManager();
    expect(typeof manager.release).toBe('function');
  });

  it('should have destroyAll method', () => {
    const manager = new SandboxManager();
    expect(typeof manager.destroyAll).toBe('function');
  });

  it('should not throw on destroyAll when empty', async () => {
    const manager = new SandboxManager();
    await expect(manager.destroyAll()).resolves.not.toThrow();
  });

  it('should throw when acquiring without initialization', async () => {
    const manager = new SandboxManager();
    await expect(manager.acquire()).rejects.toThrow();
  });
});
