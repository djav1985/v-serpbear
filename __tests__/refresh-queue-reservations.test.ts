/// <reference path="../types.d.ts" />

jest.mock('../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// A task whose finish the test controls, so overlaps can be set up on purpose
const controlledTask = () => {
  let finish: () => void = () => undefined;
  let started = false;
  const done = new Promise<void>((resolve) => { finish = resolve; });
  return { run: async () => { started = true; await done; }, finish: () => finish(), hasStarted: () => started };
};
const flush = () => new Promise<void>((resolve) => { setImmediate(resolve); });

const freshQueue = (concurrency = '3') => {
  process.env.REFRESH_QUEUE_CONCURRENCY = concurrency;
  let queue!: typeof import('../utils/refreshQueue').refreshQueue;
  jest.isolateModules(() => { queue = require('../utils/refreshQueue').refreshQueue; });
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
