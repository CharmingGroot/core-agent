import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CliRenderer } from '../src/renderer.js';
import { EventBus } from '@cli-agent/core';

describe('CliRenderer', () => {
  let eventBus: EventBus;
  let renderer: CliRenderer;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    eventBus = new EventBus();
    renderer = new CliRenderer(eventBus);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    renderer.detach();
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should attach and listen to events', () => {
    renderer.attach();
    eventBus.emit('agent:start', { runId: 'test-run-123' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should render tool:start events', () => {
    renderer.attach();
    eventBus.emit('tool:start', {
      runId: 'run-1',
      toolCall: { id: 'tc-1', name: 'file_read', arguments: '{}' },
    });
    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join(' ');
    expect(output).toContain('file_read');
  });

  it('should render tool:end success events', () => {
    renderer.attach();
    eventBus.emit('tool:end', {
      runId: 'run-1',
      toolCall: { id: 'tc-1', name: 'file_read', arguments: '{}' },
      result: { success: true, output: 'hello world' },
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should render tool:end error events', () => {
    renderer.attach();
    eventBus.emit('tool:end', {
      runId: 'run-1',
      toolCall: { id: 'tc-1', name: 'file_read', arguments: '{}' },
      result: { success: false, output: '', error: 'File not found' },
    });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should render agent:error events', () => {
    renderer.attach();
    eventBus.emit('agent:error', {
      runId: 'run-1',
      error: new Error('Test error'),
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should detach and stop listening', () => {
    renderer.attach();
    renderer.detach();
    consoleSpy.mockClear();
    eventBus.emit('agent:start', { runId: 'test-run' });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should render assistant message', () => {
    renderer.renderAssistantMessage('Hello there!');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should render error message', () => {
    renderer.renderError('Something went wrong');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('should render info message', () => {
    renderer.renderInfo('Information');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should render warning message', () => {
    renderer.renderWarning('Warning!');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should not render empty assistant message', () => {
    renderer.renderAssistantMessage('');
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
