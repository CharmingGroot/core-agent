import { describe, it, expect } from 'vitest';
import {
  AgentError,
  RegistryError,
  ConfigError,
  ProviderError,
  ToolExecutionError,
  SandboxError,
  PermissionDeniedError,
  AbortError,
} from '../src/errors/base-error.js';

describe('Errors', () => {
  it('should create AgentError with code', () => {
    const err = new AgentError('test', 'TEST_CODE');
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('AgentError');
    expect(err).toBeInstanceOf(Error);
  });

  it('should chain cause', () => {
    const cause = new Error('original');
    const err = new AgentError('wrapped', 'WRAP', cause);
    expect(err.cause).toBe(cause);
  });

  it('should create RegistryError', () => {
    const err = new RegistryError('not found');
    expect(err.code).toBe('REGISTRY_ERROR');
    expect(err.name).toBe('RegistryError');
    expect(err).toBeInstanceOf(AgentError);
  });

  it('should create ConfigError', () => {
    const err = new ConfigError('bad config');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.name).toBe('ConfigError');
  });

  it('should create ProviderError', () => {
    const err = new ProviderError('api failed');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.name).toBe('ProviderError');
  });

  it('should create ToolExecutionError with toolName', () => {
    const err = new ToolExecutionError('file-read', 'read failed');
    expect(err.toolName).toBe('file-read');
    expect(err.code).toBe('TOOL_EXECUTION_ERROR');
    expect(err.name).toBe('ToolExecutionError');
  });

  it('should create SandboxError', () => {
    const err = new SandboxError('container failed');
    expect(err.code).toBe('SANDBOX_ERROR');
    expect(err.name).toBe('SandboxError');
  });

  it('should create PermissionDeniedError', () => {
    const err = new PermissionDeniedError('shell-exec');
    expect(err.toolName).toBe('shell-exec');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.message).toContain('shell-exec');
  });

  it('should create AbortError with default message', () => {
    const err = new AbortError();
    expect(err.message).toBe('Operation aborted');
    expect(err.code).toBe('ABORT_ERROR');
  });

  it('should create AbortError with custom message', () => {
    const err = new AbortError('user cancelled');
    expect(err.message).toBe('user cancelled');
  });

  it('should be catchable as Error', () => {
    try {
      throw new RegistryError('test');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(AgentError);
      expect(e).toBeInstanceOf(RegistryError);
    }
  });
});
