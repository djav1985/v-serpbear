import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../pages/api/serp/refresh';
import db from '../database/database';
import Keyword from '../database/models/keyword';
import Domain from '../database/models/domain';
import verifyUser from '../utils/verifyUser';
import refreshAndUpdateKeywords from '../utils/refresh';
import { getAppSettings } from '../utils/appSettings';
import { scrapeKeywordWithStrategy } from '../utils/scraper';
import path from 'path';
import { retryQueueManager } from '../utils/retryQueueManager';
import { atomicWriteFile } from '../utils/atomicWrite';
import * as lockfile from 'proper-lockfile';

jest.mock('../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), update: jest.fn() },
}));
jest.mock('../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../utils/verifyUser');
jest.mock('../utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));
jest.mock('../utils/refresh', () => {
  const actual = jest.requireActual('../utils/refresh');
  return {
    __esModule: true,
    ...actual,
    default: jest.fn(),
  };
});
jest.mock('../utils/scraper', () => ({
  scrapeKeywordWithStrategy: jest.fn(),
  retryScrape: jest.fn(),
  removeFromRetryQueue: jest.fn(),
}));
jest.mock('../utils/apiLogging', () => ({
  withApiLogging: (handler: any) => handler,
}));
jest.mock('../utils/refreshQueue', () => ({
  refreshQueue: {
    enqueue: jest.fn().mockImplementation(async (_id: string, task: () => Promise<void>, _domain?: string) => {
      // Execute task immediately in tests and catch any errors
      try {
        await task();
      } catch (_error) {
        // Swallow the error in tests - the task itself handles error logging
      }
    }),
    isDomainLocked: jest.fn().mockReturnValue(false),
    // Mirrors the real queue: returns a release function, or null when a domain is already locked
    reserveDomains: jest.fn().mockImplementation((domains: string[]) => {
      const { refreshQueue } = require('../utils/refreshQueue');
      return domains.some((domain: string) => refreshQueue.isDomainLocked(domain)) ? null : () => undefined;
    }),
    getStatus: jest.fn().mockReturnValue({
      queueLength: 0, 
      activeProcesses: 0,
      activeDomains: [],
      pendingTaskIds: [],
      maxConcurrency: 3,
    }),
    setMaxConcurrency: jest.fn(),
  },
}));
jest.mock('../utils/logger', () => ({
   logger: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
   },
}));
jest.mock('../utils/atomicWrite', () => ({
   atomicWriteFile: jest.fn(),
}));
jest.mock('proper-lockfile', () => ({
   lock: jest.fn(),
}));

describe('refresh route', () => {
  describe('/api/serp/refresh', () => {
    const req = { method: 'POST', query: {}, headers: {} } as unknown as NextApiRequest;
    let res: NextApiResponse;
    const errorPayload = (reason: string) => JSON.stringify({
      reason,
      date: '2024-06-01T12:00:00.000Z',
      error: reason,
    });

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
      req.method = 'POST';
      req.query = {};
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serpapi' });
      (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue([]);
    });

    it('returns updating state for retry keyword IDs', async () => {
      req.method = 'GET';
      req.query = { status: 'retry', id: '11,12' };
      (Keyword.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ ID: 11, updating: 1, updatingStartedAt: '2024-06-01T11:55:00.000Z' }) },
        { get: () => ({ ID: 12, updating: 0, updatingStartedAt: null }) },
      ]);

      await handler(req, res);

      expect(Keyword.findAll).toHaveBeenCalledWith(expect.objectContaining({
        attributes: ['ID', 'updating', 'updatingStartedAt'],
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        keywords: [
          { ID: 11, updating: true },
          { ID: 12, updating: false },
        ],
      });
    });

    it('rejects requests with no valid keyword IDs', async () => {
      req.query = { id: 'abc,NaN' };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'No valid keyword IDs provided' }),
      }));
      expect(Keyword.findAll).not.toHaveBeenCalled();
    });

    it('starts refresh in background and returns 202 immediately', async () => {
      req.query = { id: '1', domain: 'example.com' };

      const keywordRecord = { 
        ID: 1, 
        domain: 'example.com', 
        updating: 0, // Initial state
        update: jest.fn().mockImplementation(function(this: any, payload: any) {
          // Update in-memory instance to match real Sequelize behavior
          Object.assign(this, payload);
          return Promise.resolve(undefined);
        }), 
        reload: jest.fn().mockResolvedValue(undefined), 
        set: jest.fn() 
      };
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      (refreshAndUpdateKeywords as jest.Mock).mockRejectedValue(new Error('scraper failed'));

      await handler(req, res);
    
      // Wait for async task to complete
      await jest.runAllTimersAsync();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Refresh started',
        keywordCount: 1,
        skipped: { domains: [], keywordIds: [] },
      });
      expect(keywordRecord.update).toHaveBeenCalledWith({
        updating: 1,
        lastUpdateError: 'false',
        updatingStartedAt: '2024-06-01T12:00:00.000Z',
      });
    
      // After error in refresh task, clearKeywordUpdatingFlags should clear the flag
      // (only for keywords still in updating=true state)
      expect(keywordRecord.update).toHaveBeenCalledWith({
        updating: 0,
        updatingStartedAt: null,
        lastUpdateError: errorPayload('refresh-error'),
      });
    });

    it('starts bulk refresh in background and returns 202', async () => {
      req.query = { id: '1,2', domain: 'example.com' };

      const createKeywordRecord = (id: number, overrides: Record<string, any> = {}) => {
        const baseRecord = {
          ID: id,
          domain: 'example.com',
          keyword: `keyword-${id}`,
          device: 'desktop',
          country: 'US',
          lastUpdated: '',
          volume: 0,
          added: '',
          position: id,
          sticky: 0,
          history: '{}',
          lastResult: '[]',
          url: '',
          tags: '[]',
          updating: 0,
          lastUpdateError: 'false',
          mapPackTop3: 0,
          ...overrides,
        };

        return {
          ...baseRecord,
          get: jest.fn().mockReturnValue(baseRecord),
          update: jest.fn().mockResolvedValue(undefined),
          set: jest.fn(),
        };
      };

      const keywordRecord1 = createKeywordRecord(1);
      const keywordRecord2 = createKeywordRecord(2);

      (Keyword.findAll as jest.Mock)
        .mockResolvedValueOnce([keywordRecord1, keywordRecord2]);

      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);
      const refreshedKeywords = [
        { ...keywordRecord1.get(), updating: 0 },
        { ...keywordRecord2.get(), updating: 0 },
      ];
      (refreshAndUpdateKeywords as jest.Mock).mockResolvedValue(refreshedKeywords);

      await handler(req, res);

      // Wait for async processing to complete
      await jest.runAllTimersAsync();

      // Both keywords from same domain updated together
      expect(keywordRecord1.update).toHaveBeenCalledWith({
        updating: 1,
        lastUpdateError: 'false',
        updatingStartedAt: '2024-06-01T12:00:00.000Z',
      });
      expect(keywordRecord2.update).toHaveBeenCalledWith({
        updating: 1,
        lastUpdateError: 'false',
        updatingStartedAt: '2024-06-01T12:00:00.000Z',
      });
      expect(Keyword.findAll).toHaveBeenCalledTimes(1);
      expect(refreshAndUpdateKeywords).toHaveBeenCalledTimes(1);
      expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([keywordRecord1, keywordRecord2], { scraper_type: 'serpapi' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Refresh started',
        keywordCount: 2,
        skipped: { domains: [], keywordIds: [] },
      });
    });

    it.each([
      ['the requested mobile device', { device: 'mobile' }, 'mobile'],
      ['desktop when the device parameter is omitted', {}, 'desktop'],
    ])('passes %s to keyword preview scrapes', async (_label, deviceQuery, expectedDevice) => {
      const previewReq = {
        method: 'GET',
        query: { keyword: 'widgets', country: 'US', ...deviceQuery },
        headers: {},
      } as unknown as NextApiRequest;

      const previewRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValue({
        keyword: 'widgets',
        position: 3,
        result: [],
        mapPackTop3: false,
      });

      await handler(previewReq, previewRes);

      expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(expect.objectContaining({ device: expectedDevice, position: 0 }), { scraper_type: 'serpapi' });
      expect(previewRes.status).toHaveBeenCalledWith(200);
      expect(previewRes.json).toHaveBeenCalledWith({ searchResult: expect.objectContaining({ device: expectedDevice }) });
    });

    it('rejects manual refresh when domain is already locked', async () => {
      req.query = { id: '1', domain: 'example.com' };

      const keywordRecord = { ID: 1, domain: 'example.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      // Mock domain as locked
      // Once for the atomic reservation check of the only domain
      const { refreshQueue } = require('../utils/refreshQueue');
      (refreshQueue.isDomainLocked as jest.Mock).mockReturnValueOnce(true);

      await handler(req, res);

      // Should return 409 Conflict
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'Domains are already being refreshed: example.com. Please wait for the current refresh to complete.' }),
      }));

      // Should NOT enqueue or update keywords
      expect(keywordRecord.update).not.toHaveBeenCalled();
      expect(refreshQueue.enqueue).not.toHaveBeenCalled();
    });

    it('starts the unlocked domain, skips the locked one, and reports what was skipped', async () => {
      req.query = { id: '1,2' };
      const freeKeyword = { ID: 1, domain: 'free.com', updating: 0, update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const busyKeyword = { ID: 2, domain: 'busy.com', updating: 0, update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      (Keyword.findAll as jest.Mock).mockResolvedValue([freeKeyword, busyKeyword]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'free.com', scrapeEnabled: 1 }) },
        { get: () => ({ domain: 'busy.com', scrapeEnabled: 1 }) },
      ]);

      const { refreshQueue } = require('../utils/refreshQueue');
      (refreshQueue.isDomainLocked as jest.Mock).mockImplementation((domain: string) => domain === 'busy.com');

      try {
        await handler(req, res);
      } finally {
        (refreshQueue.isDomainLocked as jest.Mock).mockReturnValue(false);
      }

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Refresh started',
        keywordCount: 1,
        skipped: { domains: ['busy.com'], keywordIds: [2] },
      });
      expect(busyKeyword.update).not.toHaveBeenCalled();
      expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([freeKeyword], expect.anything());
    });

    it('restarts a keyword whose updating flag is stale, but skips one that is still live', async () => {
      req.query = { id: '1,2', domain: 'example.com' };
      // Fake clock is 12:00. Live: flagged 10 minutes ago. Stale: flagged 2 hours ago by a run that crashed.
      const liveKeyword = {
        ID: 1, domain: 'example.com', updating: 1, updatingStartedAt: '2024-06-01T11:50:00.000Z',
        update: jest.fn().mockResolvedValue(undefined), set: jest.fn(),
      };
      const staleKeyword = {
        ID: 2, domain: 'example.com', updating: 1, updatingStartedAt: '2024-06-01T10:00:00.000Z',
        update: jest.fn().mockResolvedValue(undefined), set: jest.fn(),
      };
      (Keyword.findAll as jest.Mock).mockResolvedValue([liveKeyword, staleKeyword]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        keywordCount: 1,
        skipped: { domains: [], keywordIds: [1] },
      }));
      expect(staleKeyword.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 1 }));
      expect(liveKeyword.update).not.toHaveBeenCalled();
      expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([staleKeyword], expect.anything());
    });

    it('handles keywords with domains missing from Domain table', async () => {
      req.query = { id: '1,2', domain: 'missing-domain.com' };

      const keywordRecord1 = { 
        ID: 1, 
        domain: 'missing-domain.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
      const keywordRecord2 = { 
        ID: 2, 
        domain: 'missing-domain.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
    
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord1, keywordRecord2]);
      // Domain table returns empty array - domain doesn't exist
      (Domain.findAll as jest.Mock).mockResolvedValue([]);

      await handler(req, res);

      // Should clear updating flags for keywords with missing domains
      expect(keywordRecord1.update).toHaveBeenCalledWith({ 
        updating: 0, 
        updatingStartedAt: null,
        lastUpdateError: errorPayload('missing-domain'),
      });
      expect(keywordRecord2.update).toHaveBeenCalledWith({ 
        updating: 0, 
        updatingStartedAt: null,
        lastUpdateError: errorPayload('missing-domain'),
      });
      expect(keywordRecord1.update).toHaveBeenCalledTimes(1);
      expect(keywordRecord2.update).toHaveBeenCalledTimes(1);

      // Should return error
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'Domains not found in database: missing-domain.com. Please ensure domains are created before adding keywords.' }),
      }));

      // Should NOT call refreshAndUpdateKeywords
      expect(refreshAndUpdateKeywords).not.toHaveBeenCalled();
    });

    it('handles mixed scenario with some domains missing and some present', async () => {
      req.query = { id: '1,2,3' };

      const keywordRecord1 = { 
        ID: 1, 
        domain: 'valid-domain.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
      const keywordRecord2 = { 
        ID: 2, 
        domain: 'missing-domain.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
      const keywordRecord3 = { 
        ID: 3, 
        domain: 'valid-domain.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
    
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord1, keywordRecord2, keywordRecord3]);
      // Only valid-domain.com exists in Domain table
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'valid-domain.com', scrapeEnabled: 1 }) },
      ]);

      await handler(req, res);

      // Should clear updating flag for keyword with missing domain
      expect(keywordRecord2.update).toHaveBeenCalledWith({ 
        updating: 0, 
        updatingStartedAt: null,
        lastUpdateError: errorPayload('missing-domain'),
      });
      expect(keywordRecord2.update).toHaveBeenCalledTimes(1);

      // Should set updating flag for keywords with valid domain
      expect(keywordRecord1.update).toHaveBeenCalledWith({
        updating: 1,
        lastUpdateError: 'false',
        updatingStartedAt: '2024-06-01T12:00:00.000Z',
      });
      expect(keywordRecord3.update).toHaveBeenCalledWith({
        updating: 1,
        lastUpdateError: 'false',
        updatingStartedAt: '2024-06-01T12:00:00.000Z',
      });

      // Should proceed with refresh for valid keywords
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Refresh started',
        keywordCount: 2,
        skipped: { domains: [], keywordIds: [] },
      });
    });

    it('handles partial failures when clearing flags for some keywords', async () => {
      req.query = { id: '1,2,3', domain: 'example.com' };

      let keywordRecord2UpdateCallCount = 0;
      const keywordRecord1 = { 
        ID: 1, 
        domain: 'example.com',
        updating: 0, // Initial state
        update: jest.fn().mockImplementation(function(this: any, payload: any) {
          Object.assign(this, payload);
          return Promise.resolve(undefined);
        }), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
      const keywordRecord2 = { 
        ID: 2, 
        domain: 'example.com',
        updating: 0, // Initial state
        update: jest.fn().mockImplementation(function(this: any, payload: any) {
          keywordRecord2UpdateCallCount++;
          // Fail on second call (when clearing flags)
          if (keywordRecord2UpdateCallCount > 1) {
            return Promise.reject(new Error('Database connection lost'));
          }
          Object.assign(this, payload);
          return Promise.resolve(undefined);
        }), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
      const keywordRecord3 = { 
        ID: 3, 
        domain: 'example.com',
        updating: 0, // Initial state
        update: jest.fn().mockImplementation(function(this: any, payload: any) {
          Object.assign(this, payload);
          return Promise.resolve(undefined);
        }), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };

      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord1, keywordRecord2, keywordRecord3]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      // Simulate scraping failure to trigger clearKeywordUpdatingFlags
      (refreshAndUpdateKeywords as jest.Mock).mockRejectedValue(new Error('Scraping failed'));

      await handler(req, res);

      // Wait for async task to complete
      await jest.runAllTimersAsync();

      // All keywords should initially have updating flag set
      expect(keywordRecord1.update).toHaveBeenCalledWith({
        updating: 1,
        lastUpdateError: 'false',
        updatingStartedAt: '2024-06-01T12:00:00.000Z',
      });

      // clearKeywordUpdatingFlags should attempt to clear all keywords
      // Keyword 1 and 3 should succeed (only keywords still in updating state)
      expect(keywordRecord1.update).toHaveBeenCalledWith({
        updating: 0,
        updatingStartedAt: null,
        lastUpdateError: errorPayload('refresh-error'),
      });
      expect(keywordRecord3.update).toHaveBeenCalledWith({
        updating: 0,
        updatingStartedAt: null,
        lastUpdateError: errorPayload('refresh-error'),
      });
    
      // Keyword 2 should fail on the second call but this shouldn't prevent others
      expect(keywordRecord2.update).toHaveBeenCalledWith({
        updating: 0,
        updatingStartedAt: null,
        lastUpdateError: errorPayload('refresh-error'),
      });
      expect(keywordRecord2UpdateCallCount).toBe(2);
    });

    it('handles skipped keywords with disabled scraping', async () => {
      req.query = { id: '1,2', domain: 'example.com' };

      const keywordRecord1 = { 
        ID: 1, 
        domain: 'example.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };
      const keywordRecord2 = { 
        ID: 2, 
        domain: 'example.com', 
        update: jest.fn().mockResolvedValue(undefined), 
        reload: jest.fn().mockResolvedValue(undefined),
        set: jest.fn() 
      };

      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord1, keywordRecord2]);
      // Domain has scraping disabled
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 0 }) },
      ]);

      await handler(req, res);

      // clearKeywordUpdatingFlags should be called for skipped keywords
      expect(keywordRecord1.update).toHaveBeenCalledWith({
        updating: 0,
        updatingStartedAt: null,
        lastUpdateError: errorPayload('scrape-disabled'),
      });
      expect(keywordRecord2.update).toHaveBeenCalledWith({
        updating: 0,
        updatingStartedAt: null,
        lastUpdateError: errorPayload('scrape-disabled'),
      });
      expect(keywordRecord1.update).toHaveBeenCalledTimes(1);
      expect(keywordRecord2.update).toHaveBeenCalledTimes(1);

      // Should return empty keywords array
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ keywords: [] });

      // refreshAndUpdateKeywords should not be called
      expect(refreshAndUpdateKeywords).not.toHaveBeenCalled();
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.useRealTimers();
    });
  });
});

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
     });

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

        it('should not write if keyword ID not in queue', async () => {
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue(entries(123, 456));

           await retryQueueManager.removeFromQueue(789);

           expect(atomicWriteFile).not.toHaveBeenCalled();
           expect(lockfile.lock).toHaveBeenCalled();
           expect(mockRelease).toHaveBeenCalled();
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

        it('should not write when no IDs match or the batch is empty', async () => {
           jest.spyOn(retryQueueManager as any, 'readQueue').mockResolvedValue(entries(123, 456));

           await retryQueueManager.removeBatch(new Set([789, 101]));
           expect(atomicWriteFile).not.toHaveBeenCalled();

           const locksBefore = (lockfile.lock as jest.Mock).mock.calls.length;
           await retryQueueManager.removeBatch(new Set([]));
           expect(atomicWriteFile).not.toHaveBeenCalled();
           expect(lockfile.lock).toHaveBeenCalledTimes(locksBefore);
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
      jest.doMock('../utils/atomicWrite', () => ({
        __esModule: true,
        atomicWriteFile: jest.fn().mockResolvedValue(undefined),
      }));
      jest.doMock('proper-lockfile', () => ({
        lock: jest.fn().mockResolvedValue(jest.fn().mockResolvedValue(undefined)),
      }));
      jest.isolateModules(() => {
        isolatedQueue = require('../utils/retryQueueManager').retryQueueManager;
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
