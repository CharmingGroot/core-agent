import { describe, it, expect, vi } from 'vitest';
import { InMemoryOperationTracker } from '../src/operation-tracker.js';

describe('InMemoryOperationTracker', () => {
  function createTracker() {
    return new InMemoryOperationTracker();
  }

  const params = {
    requestId: 'req-001',
    userId: 'user-1',
    domainId: 'dev',
    goal: 'Review code',
  };

  it('should create an operation with pending status', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);

    expect(opId).toMatch(/^op-/);

    const state = tracker.get(opId);
    expect(state).toBeDefined();
    expect(state!.status).toBe('pending');
    expect(state!.requestId).toBe('req-001');
    expect(state!.userId).toBe('user-1');
    expect(state!.domainId).toBe('dev');
    expect(state!.goal).toBe('Review code');
    expect(state!.taskResults).toHaveLength(0);
  });

  it('should transition to running', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);

    tracker.start(opId);

    expect(tracker.get(opId)!.status).toBe('running');
  });

  it('should complete with token usage', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);
    tracker.start(opId);

    tracker.complete(opId, { input: 1000, output: 500 });

    const state = tracker.get(opId)!;
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBeInstanceOf(Date);
    expect(state.tokenUsage).toEqual({ input: 1000, output: 500 });
  });

  it('should fail with error message', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);
    tracker.start(opId);

    tracker.fail(opId, 'Connection timeout');

    const state = tracker.get(opId)!;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Connection timeout');
    expect(state.completedAt).toBeInstanceOf(Date);
  });

  it('should cancel operation', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);
    tracker.start(opId);

    tracker.cancel(opId);

    const state = tracker.get(opId)!;
    expect(state.status).toBe('cancelled');
    expect(state.completedAt).toBeInstanceOf(Date);
  });

  it('should update progress', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);
    tracker.start(opId);

    tracker.updateProgress(opId, { current: 2, total: 5, message: 'Processing step 2' });

    const state = tracker.get(opId)!;
    expect(state.progress).toEqual({ current: 2, total: 5, message: 'Processing step 2' });
  });

  it('should add task results', () => {
    const tracker = createTracker();
    const opId = tracker.create(params);
    tracker.start(opId);

    tracker.addTaskResult(opId, {
      taskId: 'task-1',
      skillName: 'code-review',
      status: 'completed',
      summary: 'Review completed',
      durationMs: 1200,
    });

    tracker.addTaskResult(opId, {
      taskId: 'task-2',
      skillName: 'deploy',
      status: 'failed',
      summary: 'Deploy failed',
      durationMs: 500,
    });

    const state = tracker.get(opId)!;
    expect(state.taskResults).toHaveLength(2);
    expect(state.taskResults[0].skillName).toBe('code-review');
    expect(state.taskResults[1].status).toBe('failed');
  });

  it('should return undefined for unknown operation', () => {
    const tracker = createTracker();
    expect(tracker.get('nonexistent')).toBeUndefined();
  });

  it('should throw when operating on unknown operation', () => {
    const tracker = createTracker();
    expect(() => tracker.start('nonexistent')).toThrow('Operation not found');
    expect(() => tracker.complete('nonexistent')).toThrow('Operation not found');
    expect(() => tracker.fail('nonexistent', 'err')).toThrow('Operation not found');
    expect(() => tracker.cancel('nonexistent')).toThrow('Operation not found');
  });

  it('should list active operations', () => {
    const tracker = createTracker();
    const op1 = tracker.create({ ...params, requestId: 'r1' });
    const op2 = tracker.create({ ...params, requestId: 'r2' });
    const op3 = tracker.create({ ...params, requestId: 'r3' });

    tracker.start(op1);
    tracker.start(op2);
    tracker.start(op3);
    tracker.complete(op2);

    const active = tracker.listActive();
    expect(active).toHaveLength(2);
    expect(active.map((a) => a.operationId)).toContain(op1);
    expect(active.map((a) => a.operationId)).toContain(op3);
  });

  it('should filter operations by userId', () => {
    const tracker = createTracker();
    tracker.create({ ...params, userId: 'alice' });
    tracker.create({ ...params, userId: 'bob' });
    tracker.create({ ...params, userId: 'alice' });

    const aliceOps = tracker.list({ userId: 'alice' });
    expect(aliceOps).toHaveLength(2);
  });

  it('should filter operations by status', () => {
    const tracker = createTracker();
    const op1 = tracker.create({ ...params, requestId: 'r1' });
    const op2 = tracker.create({ ...params, requestId: 'r2' });
    tracker.start(op1);
    tracker.start(op2);
    tracker.complete(op1);

    const completed = tracker.list({ status: 'completed' });
    expect(completed).toHaveLength(1);
    expect(completed[0].operationId).toBe(op1);
  });

  it('should filter operations by domainId', () => {
    const tracker = createTracker();
    tracker.create({ ...params, domainId: 'dev' });
    tracker.create({ ...params, domainId: 'ops' });

    const devOps = tracker.list({ domainId: 'dev' });
    expect(devOps).toHaveLength(1);
  });

  it('should support pagination with offset and limit', () => {
    const tracker = createTracker();
    for (let i = 0; i < 10; i++) {
      tracker.create({ ...params, requestId: `r-${i}` });
    }

    const page = tracker.list({ offset: 3, limit: 2 });
    expect(page).toHaveLength(2);
  });

  it('should generate unique operation ids', () => {
    const tracker = createTracker();
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(tracker.create({ ...params, requestId: `r-${i}` }));
    }
    expect(ids.size).toBe(100);
  });

  it('should emit status change events', () => {
    const onChange = vi.fn();
    const tracker = new InMemoryOperationTracker({ onStatusChange: onChange });

    const opId = tracker.create(params);
    expect(onChange).toHaveBeenCalledWith(opId, 'pending', expect.objectContaining({ operationId: opId }));

    tracker.start(opId);
    expect(onChange).toHaveBeenCalledWith(opId, 'running', expect.objectContaining({ status: 'running' }));

    tracker.complete(opId);
    expect(onChange).toHaveBeenCalledWith(opId, 'completed', expect.objectContaining({ status: 'completed' }));

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('should track multiple concurrent operations independently', () => {
    const tracker = createTracker();

    const op1 = tracker.create({ ...params, requestId: 'r1', domainId: 'dev' });
    const op2 = tracker.create({ ...params, requestId: 'r2', domainId: 'ops' });
    const op3 = tracker.create({ ...params, requestId: 'r3', domainId: 'dev' });

    tracker.start(op1);
    tracker.start(op2);
    tracker.start(op3);

    tracker.updateProgress(op1, { current: 1, total: 3, message: 'Step 1' });
    tracker.updateProgress(op2, { current: 2, total: 2, message: 'Almost done' });

    tracker.complete(op2);
    tracker.fail(op3, 'timeout');

    expect(tracker.get(op1)!.status).toBe('running');
    expect(tracker.get(op2)!.status).toBe('completed');
    expect(tracker.get(op3)!.status).toBe('failed');

    expect(tracker.listActive()).toHaveLength(1);
    expect(tracker.listActive()[0].operationId).toBe(op1);
  });
});
