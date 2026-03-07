import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS } from '../src/main/ipc-channels.js';

describe('IPC Channels', () => {
  it('should define SEND_MESSAGE channel', () => {
    expect(IPC_CHANNELS.SEND_MESSAGE).toBe('agent:send-message');
  });

  it('should define ABORT channel', () => {
    expect(IPC_CHANNELS.ABORT).toBe('agent:abort');
  });

  it('should define GET_CONFIG channel', () => {
    expect(IPC_CHANNELS.GET_CONFIG).toBe('config:get');
  });

  it('should define SET_CONFIG channel', () => {
    expect(IPC_CHANNELS.SET_CONFIG).toBe('config:set');
  });

  it('should define AGENT_EVENT channel', () => {
    expect(IPC_CHANNELS.AGENT_EVENT).toBe('agent:event');
  });

  it('should define AGENT_RESPONSE channel', () => {
    expect(IPC_CHANNELS.AGENT_RESPONSE).toBe('agent:response');
  });

  it('should define AGENT_ERROR channel', () => {
    expect(IPC_CHANNELS.AGENT_ERROR).toBe('agent:error');
  });

  it('should define CONFIG_VALUE channel', () => {
    expect(IPC_CHANNELS.CONFIG_VALUE).toBe('config:value');
  });

  it('should have 18 total channels', () => {
    expect(Object.keys(IPC_CHANNELS)).toHaveLength(18);
  });

  it('should have unique channel names', () => {
    const values = Object.values(IPC_CHANNELS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
