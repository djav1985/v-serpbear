export {};

import { readFile, rename } from 'fs/promises';
import { retryQueueManager } from '../../utils/retryQueueManager';

jest.mock('fs/promises', () => ({
  __esModule: true,
  readFile: jest.fn(),
  rename: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/atomicWrite', () => ({
  __esModule: true,
  atomicWriteFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('proper-lockfile', () => ({
  lock: jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined)),
}));

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const readMock = readFile as unknown as jest.Mock;
const renameMock = rename as unknown as jest.Mock;

describe('RetryQueueManager with a corrupt queue file', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves the damaged file aside once and returns an empty queue', async () => {
    readMock.mockResolvedValue('{not json');

    await expect(retryQueueManager.peekQueue()).resolves.toEqual([]);

    expect(renameMock).toHaveBeenCalledTimes(1);
    expect(renameMock).toHaveBeenCalledWith(
      expect.stringMatching(/failed_queue\.json$/),
      expect.stringMatching(/failed_queue\.json\.corrupt-\d+$/),
    );
  });

  it('keeps queue writes working after the file was reset', async () => {
    readMock.mockResolvedValue('');

    await expect(retryQueueManager.addToQueue(5)).resolves.toBeUndefined();
  });

  it('peekQueue never throws, even on an unexpected read error', async () => {
    readMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));

    await expect(retryQueueManager.peekQueue()).resolves.toEqual([]);
  });
});
