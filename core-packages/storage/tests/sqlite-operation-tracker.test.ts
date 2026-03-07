import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SQLiteOperationTracker } from '../src/sqlite-operation-tracker.js';
import type { OperationStatus } from '@core/types';

describe('SQLiteOperationTracker', () => {
  let tmpDir: string;
  let tracker: SQLiteOperationTracker;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sqlite-tracker-'));
    tracker = await SQLiteOperationTracker.create(); // in-memory
  });

  afterEach(async () => {
    tracker.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  const createParams = {
    requestId: 'req-1',
    userId: 'user-1',
    domainId: 'domain-1',
    goal: 'Test operation',
  };

  it('should create an operation and retrieve it', () => {
    const id = tracker.create(createParams);
    expect(id).toMatch(/^op-/);

    const state = tracker.get(id);
    expect(state).toBeDefined();
    expect(state!.operationId).toBe(id);
    expect(state!.status).toBe('pending');
    expect(state!.goal).toBe('Test operation');
    expect(state!.userId).toBe('user-1');
    expect(state!.startedAt).toBeInstanceOf(Date);
    expect(state!.taskResults).toEqual([]);
    expect(state!.tokenUsage).toEqual({ input: 0, output: 0 });
  });

  it('should transition through status lifecycle', () => {
    const id = tracker.create(createParams);
    expect(tracker.get(id)!.status).toBe('pending');

    tracker.start(id);
    expect(tracker.get(id)!.status).toBe('running');

    tracker.complete(id, { input: 100, output: 50 });
    const completed = tracker.get(id)!;
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.tokenUsage).toEqual({ input: 100, output: 50 });
  });

  it('should handle fail status', () => {
    const id = tracker.create(createParams);
    tracker.start(id);
    tracker.fail(id, 'Something went wrong');

    const state = tracker.get(id)!;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Something went wrong');
    expect(state.completedAt).toBeInstanceOf(Date);
  });

  it('should handle cancel status', () => {
    const id = tracker.create(createParams);
    tracker.start(id);
    tracker.cancel(id);

    const state = tracker.get(id)!;
    expect(state.status).toBe('cancelled');
    expect(state.completedAt).toBeInstanceOf(Date);
  });

  it('should update progress', () => {
    const id = tracker.create(createParams);
    tracker.start(id);
    tracker.updateProgress(id, { current: 3, total: 10, message: 'Processing...' });

    const state = tracker.get(id)!;
    expect(state.progress).toEqual({ current: 3, total: 10, message: 'Processing...' });
  });

  it('should add and retrieve task results', () => {
    const id = tracker.create(createParams);
    tracker.start(id);

    tracker.addTaskResult(id, {
      taskId: 'task-1',
      skillName: 'file_read',
      status: 'completed',
      summary: 'Read package.json',
      durationMs: 150,
    });
    tracker.addTaskResult(id, {
      taskId: 'task-2',
      skillName: 'file_write',
      status: 'failed',
      summary: 'Permission denied',
      durationMs: 50,
    });

    const state = tracker.get(id)!;
    expect(state.taskResults).toHaveLength(2);
    expect(state.taskResults[0].taskId).toBe('task-1');
    expect(state.taskResults[0].skillName).toBe('file_read');
    expect(state.taskResults[1].status).toBe('failed');
  });

  it('should list operations with filters', () => {
    tracker.create({ ...createParams, userId: 'alice', domainId: 'd1', goal: 'op1' });
    tracker.create({ ...createParams, userId: 'bob', domainId: 'd1', goal: 'op2' });
    tracker.create({ ...createParams, userId: 'alice', domainId: 'd2', goal: 'op3' });

    expect(tracker.list()).toHaveLength(3);
    expect(tracker.list({ userId: 'alice' })).toHaveLength(2);
    expect(tracker.list({ domainId: 'd2' })).toHaveLength(1);
    expect(tracker.list({ limit: 2 })).toHaveLength(2);
  });

  it('should filter by status', () => {
    const id1 = tracker.create({ ...createParams, goal: 'first' });
    const id2 = tracker.create({ ...createParams, goal: 'second' });
    tracker.start(id1);
    tracker.start(id2);
    tracker.complete(id1);

    expect(tracker.list({ status: 'completed' })).toHaveLength(1);
    expect(tracker.list({ status: 'running' })).toHaveLength(1);
    expect(tracker.list({ status: 'pending' })).toHaveLength(0);
  });

  it('should list active operations', () => {
    const id1 = tracker.create({ ...createParams, goal: 'first' });
    const id2 = tracker.create({ ...createParams, goal: 'second' });
    const id3 = tracker.create({ ...createParams, goal: 'third' });

    tracker.start(id1);
    tracker.start(id2);
    tracker.complete(id2);

    const active = tracker.listActive();
    // id1 (running) + id3 (pending) = 2 active
    expect(active).toHaveLength(2);
    // Suppress unused variable warnings
    expect(id3).toBeTruthy();
  });

  it('should return undefined for non-existent operation', () => {
    expect(tracker.get('nonexistent')).toBeUndefined();
  });

  it('should throw when operating on non-existent operation', () => {
    expect(() => tracker.start('nonexistent')).toThrow('Operation not found');
  });

  it('should emit status change events', async () => {
    const events: Array<{ id: string; status: OperationStatus }> = [];
    const eventTracker = await SQLiteOperationTracker.create(null, {
      onStatusChange: (id, status) => events.push({ id, status }),
    });

    const id = eventTracker.create(createParams);
    eventTracker.start(id);
    eventTracker.complete(id);

    expect(events).toHaveLength(3);
    expect(events[0].status).toBe('pending');
    expect(events[1].status).toBe('running');
    expect(events[2].status).toBe('completed');

    eventTracker.close();
  });

  it('should persist data to file and reload', async () => {
    const dbPath = join(tmpDir, 'persist.db');
    const t1 = await SQLiteOperationTracker.create(dbPath);
    const id = t1.create(createParams);
    t1.start(id);
    t1.addTaskResult(id, {
      taskId: 'task-1', skillName: 'test', status: 'completed', summary: 'done', durationMs: 100,
    });
    t1.complete(id, { input: 500, output: 200 });
    await t1.save();
    t1.close();

    // Re-open from file
    const t2 = await SQLiteOperationTracker.create(dbPath);
    const state = t2.get(id)!;
    expect(state.status).toBe('completed');
    expect(state.goal).toBe('Test operation');
    expect(state.taskResults).toHaveLength(1);
    expect(state.tokenUsage).toEqual({ input: 500, output: 200 });
    t2.close();
  });
});
