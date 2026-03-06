import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../src/event-bus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should emit and receive events', () => {
    const handler = vi.fn();
    bus.on('agent:start', handler);
    bus.emit('agent:start', { runId: 'run-1' });
    expect(handler).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  it('should support multiple listeners for same event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('agent:start', handler1);
    bus.on('agent:start', handler2);
    bus.emit('agent:start', { runId: 'run-1' });
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('should not fire handler after unsubscribe', () => {
    const handler = vi.fn();
    const unsub = bus.on('agent:start', handler);
    unsub();
    bus.emit('agent:start', { runId: 'run-1' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should fire once listener only once', () => {
    const handler = vi.fn();
    bus.once('agent:start', handler);
    bus.emit('agent:start', { runId: 'run-1' });
    bus.emit('agent:start', { runId: 'run-2' });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ runId: 'run-1' });
  });

  it('should remove all listeners for an event', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('agent:start', handler1);
    bus.on('agent:end', handler2);
    bus.removeAllListeners('agent:start');
    bus.emit('agent:start', { runId: 'run-1' });
    bus.emit('agent:end', { runId: 'run-1', reason: 'done' });
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('should remove all listeners when no event specified', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('agent:start', handler1);
    bus.on('agent:end', handler2);
    bus.removeAllListeners();
    bus.emit('agent:start', { runId: 'run-1' });
    bus.emit('agent:end', { runId: 'run-1', reason: 'done' });
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should report listener count', () => {
    expect(bus.listenerCount('agent:start')).toBe(0);
    const unsub = bus.on('agent:start', vi.fn());
    bus.on('agent:start', vi.fn());
    expect(bus.listenerCount('agent:start')).toBe(2);
    unsub();
    expect(bus.listenerCount('agent:start')).toBe(1);
  });

  it('should not throw when emitting with no listeners', () => {
    expect(() => bus.emit('agent:start', { runId: 'run-1' })).not.toThrow();
  });

  it('should handle once unsubscribe before emit', () => {
    const handler = vi.fn();
    const unsub = bus.once('agent:start', handler);
    unsub();
    bus.emit('agent:start', { runId: 'run-1' });
    expect(handler).not.toHaveBeenCalled();
  });
});
