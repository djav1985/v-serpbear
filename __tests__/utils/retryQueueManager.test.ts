import path from 'path';
import { retryQueueManager } from '../../utils/retryQueueManager';
import { atomicWriteFile } from '../../utils/atomicWrite';
import * as lockfile from 'proper-lockfile';

jest.mock('../../utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
jest.mock('proper-lockfile', () => ({ lock: jest.fn() }));
describe('retry queue manager', () => {
  // Mock the logger to avoid console output during tests
  // Mock atomicWriteFile
  // Mock proper-lockfile
  // Queue entries with zero attempts, as readQueue returns them for bare keyword IDs
  const entries = (...ids: number[]) => ids.map((id) => ({ id, attempts: 0 }));

  describe('RetryQueueManager', () => {
     const testFilePath = path.join(process.cwd(), 'data', 'failed_queue.json');
     let mockRelease: jest.Mock;

     beforeEach(() => {
        jest.clearAllMocks();

        // Setup lockfile mock
        mockRelease = jest.fn().mockResolvedValue(undefined);
        (lockfile.lock as jest.Mock).mockResolvedValue(mockRelease);

        // Setup atomicWriteFile mock
        (atomicWriteFile as jest.MockedFunction<typeof atomicWriteFile>).mockResolvedValue(undefined);

        // The lock creates the queue file when it is missing. Give it an existing, empty one, so these tests
        // do not depend on (or write to) the real data folder.
        jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue('[]');
     });

     afterEach(() => { jest.restoreAllMocks(); });

     describe('locking', () => {
        it('takes the lock without resolving the real path, so the queue file can be created inside it', async () => {
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue([]);

           await retryQueueManager.addToQueue(5);

           expect(lockfile.lock).toHaveBeenCalledWith(testFilePath, expect.objectContaining({ realpath: false }));
        });
     });

     describe('addToQueue', () => {
        it('should add a keyword ID to an empty queue', async () => {
           // Mock reading empty queue
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue([]);

           await retryQueueManager.addToQueue(123);

           // A new keyword starts at one attempt
           expect(atomicWriteFile).toHaveBeenCalledWith(
              testFilePath,
              JSON.stringify([{ id: 123, attempts: 1 }]),
              'utf-8'
           );
           expect(lockfile.lock).toHaveBeenCalled();
           expect(mockRelease).toHaveBeenCalled();
        });

        it('should count a re-queue of an existing keyword as one more attempt', async () => {
           // Mock reading queue with existing ID
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue(entries(123, 456));

           await retryQueueManager.addToQueue(123);

           // Only keyword 123 changes; 456 keeps the bare-ID form
           expect(atomicWriteFile).toHaveBeenCalledWith(
              testFilePath,
              JSON.stringify([{ id: 123, attempts: 1 }, 456]),
              'utf-8'
           );
           expect(lockfile.lock).toHaveBeenCalled();
           expect(mockRelease).toHaveBeenCalled();
        });

        it('should ignore invalid keyword IDs', async () => {
           await retryQueueManager.addToQueue(0);
           await retryQueueManager.addToQueue(-1);
           await retryQueueManager.addToQueue(NaN);
           await retryQueueManager.addToQueue(null as any);

           expect(atomicWriteFile).not.toHaveBeenCalled();
           expect(lockfile.lock).not.toHaveBeenCalled();
        });

     });

     describe('removeFromQueue', () => {
        it('should remove a keyword ID from the queue, using the absolute value for negative IDs', async () => {
           const cases = [
              { queue: entries(123, 456, 789), id: 456, expected: [123, 789] },
              { queue: entries(123, 456), id: -456, expected: [123] },
           ];
           for (const { queue, id, expected } of cases) {
              jest.clearAllMocks();
              (lockfile.lock as jest.Mock).mockResolvedValue(mockRelease);
              jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue(queue);

              await retryQueueManager.removeFromQueue(id);

              expect(atomicWriteFile).toHaveBeenCalledWith(testFilePath, JSON.stringify(expected), 'utf-8');
              expect(lockfile.lock).toHaveBeenCalled();
              expect(mockRelease).toHaveBeenCalled();
           }
        });


     });

     describe('removeBatch', () => {
        it('should remove multiple keyword IDs in one operation', async () => {
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue(entries(123, 456, 789, 101));

           await retryQueueManager.removeBatch(new Set([456, 789]));

           expect(atomicWriteFile).toHaveBeenCalledWith(
              testFilePath,
              JSON.stringify([123, 101]),
              'utf-8'
           );
           expect(lockfile.lock).toHaveBeenCalledTimes(1);
        });

     });

     describe('clearQueue', () => {
        it('should clear the entire queue', async () => {
           await retryQueueManager.clearQueue();

           expect(atomicWriteFile).toHaveBeenCalledWith(
              testFilePath,
              JSON.stringify([]),
              'utf-8'
           );
           expect(lockfile.lock).toHaveBeenCalled();
           expect(mockRelease).toHaveBeenCalled();
        });
     });

     describe('error handling', () => {
        it('should handle lock acquisition failure', async () => {
           const lockError = new Error('Failed to acquire lock');
           (lockfile.lock as jest.Mock).mockRejectedValue(lockError);

           await expect(retryQueueManager.addToQueue(123)).rejects.toThrow('Failed to acquire lock');
        });

        it('should handle write failure', async () => {
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue([]);
           const writeError = new Error('Write failed');
           (atomicWriteFile as jest.MockedFunction<typeof atomicWriteFile>).mockRejectedValue(writeError);

           await expect(retryQueueManager.addToQueue(123)).rejects.toThrow('Write failed');
           expect(mockRelease).toHaveBeenCalled(); // Lock should still be released
        });

        it('should handle lock release failure gracefully', async () => {
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue([]);
           mockRelease.mockRejectedValue(new Error('Release failed'));

           // Should not throw despite release failure
           await expect(retryQueueManager.addToQueue(123)).resolves.toBeUndefined();
        });
     });

     describe('concurrent operations', () => {
        it('should serialize multiple concurrent operations', async () => {
           const operations: Promise<void>[] = [];
           let lockAcquireOrder: number[] = [];
           let operationOrder = 0;

           // Mock lock to track acquisition order
           (lockfile.lock as jest.Mock).mockImplementation(async () => {
              const order = ++operationOrder;
              lockAcquireOrder.push(order);
              return mockRelease;
           });

           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue([]);

           // Launch multiple operations concurrently
           for (let i = 1; i <= 5; i++) {
              operations.push(retryQueueManager.addToQueue(i * 100));
           }

           await Promise.all(operations);

           // All operations should have acquired locks (serialized by proper-lockfile)
           expect(lockAcquireOrder).toHaveLength(5);
           expect(lockfile.lock).toHaveBeenCalledTimes(5);
           expect(mockRelease).toHaveBeenCalledTimes(5);
        });
     });

  });

  // Corrupt-file tests need fs/promises mocked, which would break the spies above, so they load in an isolated registry.
  describe('RetryQueueManager with a corrupt queue file', () => {
    let isolatedQueue: any;
    let readMock: jest.Mock;
    let renameMock: jest.Mock;

    beforeAll(() => {
      jest.resetModules();
      jest.doMock('fs/promises', () => ({
        __esModule: true,
        readFile: jest.fn(),
        rename: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
      }));
      jest.doMock('../../utils/atomicWrite', () => ({
        __esModule: true,
        atomicWriteFile: jest.fn().mockResolvedValue(undefined),
      }));
      jest.doMock('proper-lockfile', () => ({
        lock: jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined)),
      }));
      jest.isolateModules(() => {
        isolatedQueue = require('../../utils/retryQueueManager').retryQueueManager;
        readMock = require('fs/promises').readFile;
        renameMock = require('fs/promises').rename;
      });
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('moves the damaged file aside once and returns an empty queue', async () => {
      readMock.mockResolvedValue('{not json');

      await expect(isolatedQueue.peekQueue()).resolves.toEqual([]);

      expect(renameMock).toHaveBeenCalledTimes(1);
      expect(renameMock).toHaveBeenCalledWith(
        expect.stringMatching(/failed_queue\.json$/),
        expect.stringMatching(/failed_queue\.json\.corrupt-\d+$/),
      );
    });

    it('keeps queue writes working after the file was reset', async () => {
      readMock.mockResolvedValue('');

      await expect(isolatedQueue.addToQueue(5)).resolves.toBeUndefined();
    });

    it('reads bare IDs as zero attempts and object entries with their attempts (missing attempts = 0)', async () => {
      readMock.mockResolvedValue(JSON.stringify([5, { id: 6, attempts: 2 }, { id: 7 }]));

      await expect(isolatedQueue.peekEntries()).resolves.toEqual([
        { id: 5, attempts: 0 },
        { id: 6, attempts: 2 },
        { id: 7, attempts: 0 },
      ]);
      await expect(isolatedQueue.getAttempts(6)).resolves.toBe(2);
      await expect(isolatedQueue.getAttempts(99)).resolves.toBe(0);
    });

    it('peekQueue never throws, even on an unexpected read error', async () => {
      readMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));

      await expect(isolatedQueue.peekQueue()).resolves.toEqual([]);
    });
  });
});
