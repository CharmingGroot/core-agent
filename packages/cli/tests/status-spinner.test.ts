import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusSpinner } from '../src/status-spinner.js';

describe('StatusSpinner', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('should create a spinner instance', () => {
    const spinner = new StatusSpinner();
    expect(spinner).toBeDefined();
    expect(spinner.isActive).toBe(false);
  });

  it('should write output on start in non-TTY mode', () => {
    const spinner = new StatusSpinner();
    // In test env, isTTY is false so it prints once and stops
    spinner.start('Thinking…', '✽');
    expect(writeSpy).toHaveBeenCalled();
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Thinking');
    expect(spinner.isActive).toBe(false); // non-TTY doesn't use interval
  });

  it('should accept metric updates without error', () => {
    const spinner = new StatusSpinner();
    spinner.start('Working…');
    spinner.updateMetrics({ inputTokens: 500 });
    spinner.updateMetrics({ outputTokens: 200, streamChunks: 10 });
    spinner.stop();
    expect(spinner.isActive).toBe(false);
  });

  it('should stop cleanly with a final message', () => {
    const spinner = new StatusSpinner();
    spinner.start('Test');
    spinner.stop('Done!');
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Done!');
    expect(spinner.isActive).toBe(false);
  });

  it('should stop cleanly without a final message', () => {
    const spinner = new StatusSpinner();
    spinner.start('Test');
    spinner.stop();
    expect(spinner.isActive).toBe(false);
  });

  it('should handle double stop gracefully', () => {
    const spinner = new StatusSpinner();
    spinner.start('Test');
    spinner.stop('First');
    spinner.stop('Second'); // should not throw
    expect(spinner.isActive).toBe(false);
  });

  it('should handle start after stop (restart)', () => {
    const spinner = new StatusSpinner();
    spinner.start('First');
    spinner.stop();
    spinner.start('Second');
    spinner.stop('Done');
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(output).toContain('Second');
  });
});
