/// <reference path="../../types.d.ts" />

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// A task whose finish the test controls, so overlaps can be set up on purpose
const controlledTask = () => {
  let finish: () => void = () => undefined;
  let started = false;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  return { run: async () => { started = true; await done; }, finish: () => finish(), hasStarted: () => started };
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

const freshQueue = (concurrency = '3') => {
  process.env.REFRESH_QUEUE_CONCURRENCY = concurrency;
  let queue!: typeof import('../../utils/refreshQueue').refreshQueue;
  jest.isolateModules(() => { queue = require('../../utils/refreshQueue').refreshQueue; });
  return queue;
};

describe('refresh queue reservations', () => {
  afterEach(() => { delete process.env.REFRESH_QUEUE_CONCURRENCY; });

  it('keeps a queued refresh waiting while a delete or location edit holds the domain, then runs it on release', async () => {
    const queue = freshQueue();
    const release = queue.reserveDomains(['example.com'])!;
    const refresh = controlledTask();

    queue.enqueue('refresh', refresh.run, ['example.com']);
    await flush();
    expect(refresh.hasStarted()).toBe(false);

    release();
    await flush();
    expect(refresh.hasStarted()).toBe(true);
    refresh.finish();
    await flush();
  });

  it('does not hold back a refresh for a different domain', async () => {
    const queue = freshQueue();
    queue.reserveDomains(['example.com']);
    const other = controlledTask();

    queue.enqueue('other', other.run, ['other.com']);
    await flush();
    expect(other.hasStarted()).toBe(true);
    other.finish();
    await flush();
  });

  it('hands a reservation to the task that queues itself: the domain stays locked until it starts, and no one slips in', async () => {
    const queue = freshQueue('1');
    const busy = controlledTask();
    queue.enqueue('busy', busy.run, ['busy.com']);
    await flush();

    const release = queue.reserveDomains(['example.com'])!;
    const own = controlledTask();
    queue.enqueue('own', own.run, ['example.com'], { reservations: [release] });
    await flush();

    // Only one slot and it is taken, so the task is still waiting, and its domain is still claimed
    expect(own.hasStarted()).toBe(false);
    expect(queue.reserveDomains(['example.com'])).toBeNull();
    // Giving the claim up after the hand-off changes nothing
    release();
    expect(queue.isDomainLocked('example.com')).toBe(true);

    busy.finish();
    await flush();
    expect(own.hasStarted()).toBe(true);
    own.finish();
    await flush();
    expect(queue.isDomainLocked('example.com')).toBe(false);
  });

  it('runs a task with its own reservation ahead of a foreign task on the same domain that was queued earlier', async () => {
    const queue = freshQueue();
    const other = queue.reserveDomains(['a.com'])!;
    const first = controlledTask();
    queue.enqueue('first', first.run, ['a.com']);
    await flush();
    expect(first.hasStarted()).toBe(false);
    other();
    await flush();
    expect(first.hasStarted()).toBe(true);
    first.finish();
    await flush();
  });

  it('releases the domain and runs waiting work when a task throws synchronously', async () => {
    const queue = freshQueue('1');
    const reservation = queue.reserveDomains(['example.com'])!;
    const waiting = jest.fn().mockResolvedValue(undefined);

    await queue.enqueue('waiting', waiting, ['example.com']);
    await queue.enqueue('broken', () => { throw new Error('startup failed'); }, ['example.com'], { reservations: [reservation] });
    await flush();

    expect(waiting).toHaveBeenCalledTimes(1);
    expect(queue.isDomainLocked('example.com')).toBe(false);
  });

  it('refuses a new reservation while a task is queued or running on the domain', async () => {
    const queue = freshQueue();
    const running = controlledTask();
    queue.enqueue('running', running.run, ['example.com']);
    await flush();
    expect(queue.reserveDomains(['example.com'])).toBeNull();
    running.finish();
    await flush();
    expect(queue.reserveDomains(['example.com'])).not.toBeNull();
  });
});

describe('refresh queue', () => {
  /**
   * Behavior tests for RefreshQueue: concurrency, per-domain locking,
   * error resilience, status reporting, and configurable concurrency.
   */


  // ---------------------------------------------------------------------------
  // Queue behavior (enqueue / dequeue / concurrency / locking)
  // ---------------------------------------------------------------------------

  describe('RefreshQueue behavior', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('processes tasks in parallel up to maxConcurrency', async () => {
      const queue = freshQueue();
      const executionOrder: number[] = [];
      const releases = Array.from({ length: 4 }, deferred);
      const fourthStarted = deferred();
      const tasks = releases.map((release, index) => jest.fn(async () => {
        executionOrder.push(index + 1);
        if (index === 3) fourthStarted.resolve();
        await release.promise;
      }));

      for (const [index, task] of tasks.entries()) {
        await queue.enqueue(`task${index + 1}`, task);
      }

      try {
        expect(executionOrder).toEqual([1, 2, 3]);
        expect(tasks[3]).not.toHaveBeenCalled();
        releases[0].resolve();
        await fourthStarted.promise;
        expect(executionOrder).toEqual([1, 2, 3, 4]);
      } finally {
        releases.forEach((release) => release.resolve());
        await flush();
      }
      tasks.forEach((task) => expect(task).toHaveBeenCalledTimes(1));
    });

    it('respects per-domain locking', async () => {
      const queue = freshQueue();
      const executionOrder: string[] = [];
      const releaseFirst = deferred();
      const secondStarted = deferred();
      const domainATask1 = jest.fn(async () => {
        executionOrder.push('A1-start');
        await releaseFirst.promise;
        executionOrder.push('A1-end');
      });
      const domainATask2 = jest.fn(async () => {
        executionOrder.push('A2-start');
        secondStarted.resolve();
      });
      const domainBTask = jest.fn(async () => {
        executionOrder.push('B-start');
      });

      await queue.enqueue('task-a1', domainATask1, ['domainA']);
      await queue.enqueue('task-a2', domainATask2, ['domainA']);
      await queue.enqueue('task-b', domainBTask, ['domainB']);

      try {
        expect(executionOrder).toEqual(['A1-start', 'B-start']);
        expect(domainATask2).not.toHaveBeenCalled();
        releaseFirst.resolve();
        await secondStarted.promise;
        const a1EndIndex = executionOrder.indexOf('A1-end');
        const a2StartIndex = executionOrder.indexOf('A2-start');
        expect(a2StartIndex).toBeGreaterThan(a1EndIndex);
        const bStartIndex = executionOrder.indexOf('B-start');
        expect(bStartIndex).toBeLessThan(a1EndIndex);
      } finally {
        releaseFirst.resolve();
        await flush();
      }
      expect(domainATask1).toHaveBeenCalledTimes(1);
      expect(domainATask2).toHaveBeenCalledTimes(1);
      expect(domainBTask).toHaveBeenCalledTimes(1);
    });



    it('atomically locks every domain in a task while allowing unrelated work', async () => {
      const queue = freshQueue();
      const order: string[] = [];
      const gate = deferred();
      const aStarted = deferred();
      const bStarted = deferred();

      await queue.enqueue('multi', async () => { order.push('AB-start'); await gate.promise; order.push('AB-end'); }, ['A', 'B', 'a', '']);
      await queue.enqueue('only-a', async () => { order.push('A-start'); aStarted.resolve(); }, ['A']);
      await queue.enqueue('only-b', async () => { order.push('B-start'); bStarted.resolve(); }, ['B']);
      await queue.enqueue('only-c', async () => { order.push('C-start'); }, ['C']);

      try {
        expect(queue.isDomainLocked('A')).toBe(true);
        expect(queue.isDomainLocked('B')).toBe(true);
        expect(order).toContain('C-start');
        expect(order).not.toContain('A-start');
        expect(order).not.toContain('B-start');
        gate.resolve();
        await Promise.all([aStarted.promise, bStarted.promise]);
        expect(order.indexOf('A-start')).toBeGreaterThan(order.indexOf('AB-end'));
        expect(order.indexOf('B-start')).toBeGreaterThan(order.indexOf('AB-end'));
      } finally {
        gate.resolve();
        await flush();
      }
    });

    it('continues processing after task failure', async () => {
      const queue = freshQueue();
      const executionOrder: number[] = [];
      const releaseFirst = deferred();
      const thirdStarted = deferred();
      queue.setMaxConcurrency(1);
      const task1 = jest.fn(async () => { executionOrder.push(1); await releaseFirst.promise; });
      const task2 = jest.fn(async () => {
        executionOrder.push(2);
        throw new Error('Task 2 failed');
      });
      const task3 = jest.fn(async () => { executionOrder.push(3); thirdStarted.resolve(); });

      try {
        await queue.enqueue('task1', task1);
        await queue.enqueue('task2', task2);
        await queue.enqueue('task3', task3);
        expect(executionOrder).toEqual([1]);

        releaseFirst.resolve();
        await thirdStarted.promise;
        expect(executionOrder).toEqual([1, 2, 3]);
        expect(task1).toHaveBeenCalledTimes(1);
        expect(task2).toHaveBeenCalledTimes(1);
        expect(task3).toHaveBeenCalledTimes(1);
      } finally {
        releaseFirst.resolve();
        queue.setMaxConcurrency(3);
        await flush();
      }
    });

    it('returns correct queue status', async () => {
      const queue = freshQueue();
      const gate = deferred();
      const taskStarted = deferred();
      const longRunningTask = jest.fn(async () => { taskStarted.resolve(); await gate.promise; });

      await queue.enqueue('long-task', longRunningTask, ['testDomain']);
      await taskStarted.promise;
      const status = queue.getStatus();
      gate.resolve();
      await flush();

      expect(status.activeProcesses).toBeGreaterThan(0);
      expect(status.activeDomains).toContain('testdomain');
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

    it('reads valid positive integers from the env var', () => {
      for (const [value, expected] of [['1', 1], ['5', 5], ['10', 10]] as const) {
        jest.resetModules();
        process.env.REFRESH_QUEUE_CONCURRENCY = value;

        const { refreshQueue: q } = require('../../utils/refreshQueue');
        expect(q.getStatus().maxConcurrency).toBe(expected);
      }
    });

    it('falls back to the default of 3 when the env var is invalid, zero or negative', () => {
      for (const value of ['invalid', '0', '-1']) {
        jest.resetModules();
        process.env.REFRESH_QUEUE_CONCURRENCY = value;

        const { refreshQueue: q } = require('../../utils/refreshQueue');
        expect(q.getStatus().maxConcurrency).toBe(3);
      }
    });
  });
});
