/**
 * Behavior tests for RefreshQueue: concurrency, per-domain locking,
 * error resilience, status reporting, and configurable concurrency.
 */

import { refreshQueue } from '../../utils/refreshQueue';

// ---------------------------------------------------------------------------
// Queue behavior (enqueue / dequeue / concurrency / locking)
// ---------------------------------------------------------------------------

describe('RefreshQueue behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes tasks in parallel up to maxConcurrency', async () => {
    const executionOrder: number[] = [];
    let task1Started = false;
    let task2Started = false;
    let task3Started = false;

    const task1 = jest.fn(async () => {
      task1Started = true;
      executionOrder.push(1);
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    const task2 = jest.fn(async () => {
      task2Started = true;
      executionOrder.push(2);
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    const task3 = jest.fn(async () => {
      task3Started = true;
      executionOrder.push(3);
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await refreshQueue.enqueue('task1', task1);
    await refreshQueue.enqueue('task2', task2);
    await refreshQueue.enqueue('task3', task3);

    // All 3 should start immediately (within maxConcurrency of 3)
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(task1Started).toBe(true);
    expect(task2Started).toBe(true);
    expect(task3Started).toBe(true);

    // Wait for all tasks to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).toHaveBeenCalledTimes(1);
    expect(task3).toHaveBeenCalledTimes(1);
  });

  it('respects per-domain locking', async () => {
    const executionOrder: string[] = [];

    const domainATask1 = jest.fn(async () => {
      executionOrder.push('A1-start');
      await new Promise(resolve => setTimeout(resolve, 50));
      executionOrder.push('A1-end');
    });

    const domainATask2 = jest.fn(async () => {
      executionOrder.push('A2-start');
      await new Promise(resolve => setTimeout(resolve, 20));
      executionOrder.push('A2-end');
    });

    const domainBTask = jest.fn(async () => {
      executionOrder.push('B-start');
      await new Promise(resolve => setTimeout(resolve, 30));
      executionOrder.push('B-end');
    });

    await refreshQueue.enqueue('task-a1', domainATask1, 'domainA');
    await refreshQueue.enqueue('task-a2', domainATask2, 'domainA');
    await refreshQueue.enqueue('task-b', domainBTask, 'domainB');

    // Wait for all tasks to complete
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(domainATask1).toHaveBeenCalledTimes(1);
    expect(domainATask2).toHaveBeenCalledTimes(1);
    expect(domainBTask).toHaveBeenCalledTimes(1);

    // A2 should start after A1 ends
    const a1EndIndex = executionOrder.indexOf('A1-end');
    const a2StartIndex = executionOrder.indexOf('A2-start');
    expect(a2StartIndex).toBeGreaterThan(a1EndIndex);

    // B can start before A1 ends (parallel processing)
    const bStartIndex = executionOrder.indexOf('B-start');
    expect(bStartIndex).toBeLessThan(a1EndIndex);
  });

  it('continues processing after task failure', async () => {
    const executionOrder: number[] = [];
    const task1 = jest.fn(async () => { executionOrder.push(1); });
    const task2 = jest.fn(async () => {
      executionOrder.push(2);
      throw new Error('Task 2 failed');
    });
    const task3 = jest.fn(async () => { executionOrder.push(3); });

    await refreshQueue.enqueue('task1', task1);
    await refreshQueue.enqueue('task2', task2);
    await refreshQueue.enqueue('task3', task3);

    // Wait for all tasks to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify all tasks executed despite failure
    expect(executionOrder).toEqual([1, 2, 3]);
    expect(task1).toHaveBeenCalledTimes(1);
    expect(task2).toHaveBeenCalledTimes(1);
    expect(task3).toHaveBeenCalledTimes(1);
  });

  it('returns correct queue status', async () => {
    const longRunningTask = jest.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await refreshQueue.enqueue('long-task', longRunningTask, 'testDomain');

    // Check status immediately (should be processing)
    await new Promise(resolve => setTimeout(resolve, 5));
    const status = refreshQueue.getStatus();

    expect(status.activeProcesses).toBeGreaterThan(0);
    expect(status.activeDomains).toContain('testDomain');
    expect(status.maxConcurrency).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Configurable concurrency (reads REFRESH_QUEUE_CONCURRENCY env var)
// ---------------------------------------------------------------------------

describe('RefreshQueue concurrency configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default concurrency of 3 when env var not set', () => {
    delete process.env.REFRESH_QUEUE_CONCURRENCY;

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(3);
  });

  it('should read concurrency from environment variable', () => {
    process.env.REFRESH_QUEUE_CONCURRENCY = '5';

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(5);
  });

  it('should use default when env var is invalid', () => {
    process.env.REFRESH_QUEUE_CONCURRENCY = 'invalid';

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(3);
  });

  it('should use default when env var is 0', () => {
    process.env.REFRESH_QUEUE_CONCURRENCY = '0';

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(3);
  });

  it('should use default when env var is negative', () => {
    process.env.REFRESH_QUEUE_CONCURRENCY = '-1';

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(3);
  });

  it('should allow setting concurrency to 1', () => {
    process.env.REFRESH_QUEUE_CONCURRENCY = '1';

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(1);
  });

  it('should allow high concurrency values', () => {
    process.env.REFRESH_QUEUE_CONCURRENCY = '10';

    const { refreshQueue: q } = require('../../utils/refreshQueue');
    expect(q.getStatus().maxConcurrency).toBe(10);
  });
});
