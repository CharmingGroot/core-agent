import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionManager } from '../src/session-manager.js';
import { MessageManager } from '../src/message-manager.js';

describe('SessionManager', () => {
  let sessionsDir: string;
  let sm: SessionManager;

  beforeEach(async () => {
    sessionsDir = await mkdtemp(join(tmpdir(), 'session-test-'));
    sm = new SessionManager(sessionsDir);
  });

  afterEach(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });

  it('should save and load a session', async () => {
    const manager = new MessageManager();
    manager.addSystemMessage('You are helpful.');
    manager.addUserMessage('Hello');
    manager.addAssistantMessage('Hi!');

    await sm.save('test-1', manager);

    const restored = new MessageManager();
    const meta = await sm.load('test-1', restored);

    expect(restored.messageCount).toBe(3);
    const msgs = restored.getMessages();
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[1]?.content).toBe('Hello');
    expect(msgs[2]?.content).toBe('Hi!');
    expect(meta.sessionId).toBe('test-1');
    expect(meta.createdAt).toBeTruthy();
  });

  it('should preserve createdAt on re-save', async () => {
    const manager = new MessageManager();
    manager.addUserMessage('first');

    await sm.save('test-2', manager);
    const meta1 = await sm.load('test-2', new MessageManager());

    // Wait a tiny bit, then save again
    manager.addUserMessage('second');
    await sm.save('test-2', manager);
    const meta2 = await sm.load('test-2', new MessageManager());

    expect(meta2.createdAt).toBe(meta1.createdAt);
    expect(meta2.updatedAt >= meta1.updatedAt).toBe(true);
  });

  it('should check existence', async () => {
    expect(await sm.exists('nope')).toBe(false);

    const manager = new MessageManager();
    manager.addUserMessage('hi');
    await sm.save('exists-1', manager);

    expect(await sm.exists('exists-1')).toBe(true);
  });

  it('should list sessions sorted by updatedAt', async () => {
    const m1 = new MessageManager();
    m1.addUserMessage('session A');
    await sm.save('a', m1);

    const m2 = new MessageManager();
    m2.addUserMessage('session B');
    await sm.save('b', m2);

    const list = await sm.list();
    expect(list).toHaveLength(2);
    // Most recent first
    expect(list[0]?.sessionId).toBe('b');
    expect(list[1]?.sessionId).toBe('a');
  });

  it('should return empty list for non-existent directory', async () => {
    const badSm = new SessionManager('/tmp/nonexistent-session-dir-xyz');
    const list = await badSm.list();
    expect(list).toEqual([]);
  });

  it('should throw on load for non-existent session', async () => {
    const manager = new MessageManager();
    await expect(sm.load('missing', manager)).rejects.toThrow();
  });

  it('should sanitize sessionId to prevent path traversal', async () => {
    const manager = new MessageManager();
    manager.addUserMessage('sneaky');
    // Malicious session ID with path traversal
    await sm.save('../../../etc/passwd', manager);

    // Should be saved safely inside sessionsDir
    expect(await sm.exists('../../../etc/passwd')).toBe(true);
    const list = await sm.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.sessionId).toBe('../../../etc/passwd');
  });
});
