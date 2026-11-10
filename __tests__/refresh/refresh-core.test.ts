import Cryptr from 'cryptr';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import refreshAndUpdateKeywords, { updateKeywordPosition } from '../../utils/refresh';
import { type RefreshResult, removeFromRetryQueue, retryScrape, scrapeKeywordWithStrategy } from '../../utils/scraper';
import { toDbBool } from '../../utils/dbBooleans';
import { refreshQueue } from '../../utils/refreshQueue';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { readSettingsFile, withSettingsLock } from '../../utils/settingsFile';

jest.mock('../../database/models/domain');
jest.mock('../../database/models/keyword');
jest.mock('../../utils/scraper', () => ({
  removeFromRetryQueue: jest.fn(),
  retryScrape: jest.fn(),
  scrapeKeywordWithStrategy: jest.fn(),
}));
jest.mock('../../utils/retryQueueManager', () => ({
  retryQueueManager: {
    addToQueue: jest.fn().mockResolvedValue(undefined),
    getAttempts: jest.fn().mockResolvedValue(0),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    removeBatch: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../utils/updateDomainStats', () => ({
  updateDomainStats: jest.fn().mockResolvedValue(undefined),
}));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

const yieldToQueue = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('refresh core', () => {
  // Mock the dependencies
  // Mock retryQueueManager
  // Mock updateDomainStats so it doesn't require real DB access
  describe('refreshAndUpdateKeywords', () => {
    const mockSettings = {
      scraper_type: 'serpapi',
      scrape_retry: true,
    } as SettingsType;

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret';
    });

    it('limits sequential scraper concurrency per domain, with desktop and mobile keywords in one pass', async () => {
      const previousConcurrency = process.env.PARALLEL_SCRAPE_CONCURRENCY;
      process.env.PARALLEL_SCRAPE_CONCURRENCY = '3';

      const domains = ['first.example', 'second.example'];
      (Domain.findAll as jest.Mock).mockResolvedValue(domains.map((domain) => ({
        get: () => ({ domain, scrapeEnabled: 1 }),
      })));

      const keywords: Keyword[] = [];
      const desktopIdsByDomain = new Map<string, number[]>();
      domains.forEach((domain, domainIndex) => {
        const firstId = (domainIndex + 1) * 100;
        const desktopKeywords = Array.from({ length: 4 }, (_, index) => ({
          id: firstId + index + 1,
          keyword: `query-${index + 1}-${domain}`,
          device: 'desktop',
        }));
        desktopIdsByDomain.set(domain, desktopKeywords.map((keyword) => keyword.id));
        const domainKeywords = [
          ...desktopKeywords,
          { id: firstId + 5, keyword: desktopKeywords[0].keyword, device: 'mobile' },
        ];

        domainKeywords.forEach(({ id, keyword, device }) => {
          const keywordPlain = {
            ID: id,
            keyword,
            domain,
            device,
            country: 'US',
            location: '',
            position: 0,
            volume: 0,
            updating: 1,
            sticky: 0,
            history: '{}',
            lastResult: '[]',
            lastUpdateError: 'false',
            lastUpdated: '2024-01-01T00:00:00.000Z',
            added: '2024-01-01T00:00:00.000Z',
            url: '',
            tags: '[]',
            mapPackTop3: false,
          };
          keywords.push({
            ...keywordPlain,
            get: jest.fn().mockReturnValue(keywordPlain),
            set: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
          } as unknown as Keyword);
        });
      });

      const activeByDomain = new Map<string, number>();
      const peakByDomain = new Map<string, number>();
      const completedIds = new Set<number>();
      const desktopQueueRefillChecks: boolean[] = [];
      const slowDesktopReleases: Array<() => void> = [];
      const refillSignals = new Map<string, () => void>();
      const refillPromises = domains.map((domain) => new Promise<void>((resolve) => {
        refillSignals.set(domain, resolve);
      }));
      let activeTotal = 0;
      let peakTotal = 0;

      (scrapeKeywordWithStrategy as jest.Mock).mockImplementation(async (keyword) => {
        const keywordId = keyword.ID as number;
        const domain = keyword.domain as string;
        const device = keyword.device as string;
        if (keywordId % 100 === 4) {
          const firstDesktopId = desktopIdsByDomain.get(domain)?.[0];
          const laterDesktopIds = desktopIdsByDomain.get(domain)?.slice(1, 3) || [];
          desktopQueueRefillChecks.push(
            laterDesktopIds.every((id) => completedIds.has(id))
              && firstDesktopId !== undefined
              && !completedIds.has(firstDesktopId),
          );
          refillSignals.get(domain)?.();
        }

        const activeForDomain = (activeByDomain.get(domain) || 0) + 1;
        activeByDomain.set(domain, activeForDomain);
        peakByDomain.set(domain, Math.max(peakByDomain.get(domain) || 0, activeForDomain));
        activeTotal += 1;
        peakTotal = Math.max(peakTotal, activeTotal);
        if (device === 'desktop' && keywordId % 100 === 1) {
          await new Promise<void>((resolve) => slowDesktopReleases.push(resolve));
        } else {
          await Promise.resolve();
        }
        activeByDomain.set(domain, activeByDomain.get(domain)! - 1);
        activeTotal -= 1;
        completedIds.add(keywordId);

        return {
          ID: keywordId,
          position: 1,
          result: [],
          mapPackTop3: device === 'desktop',
          error: false,
        } as unknown as RefreshResult;
      });

      const refreshPromise = refreshAndUpdateKeywords(keywords, {
          scraper_type: 'valueserp',
          scrape_retry: false,
          scrape_delay: '0',
        } as SettingsType);

      try {
        const refillStarted = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 1000);
          Promise.all(refillPromises).then(() => {
            clearTimeout(timeout);
            resolve(true);
          });
        });

        expect(refillStarted).toBe(true);
        expect(slowDesktopReleases).toHaveLength(2);
        await Promise.all(slowDesktopReleases.map((release) => release()));
        await refreshPromise;
      } finally {
        slowDesktopReleases.forEach((release) => release());
        await refreshPromise.catch(() => undefined);
        if (previousConcurrency === undefined) {
          delete process.env.PARALLEL_SCRAPE_CONCURRENCY;
        } else {
          process.env.PARALLEL_SCRAPE_CONCURRENCY = previousConcurrency;
        }
      }

      expect(Array.from(peakByDomain.values())).toEqual([3, 3]);
      expect(peakTotal).toBe(6);
      expect(desktopQueueRefillChecks).toEqual([true, true]);
    });

    it('retries a failed sequential scrape until the keyword has used its retries, then drops it from the queue', async () => {
      // MAX_RETRY_ATTEMPTS is 3: a keyword already re-queued 3 times is dropped instead of queued again
      const { retryQueueManager } = require('../../utils/retryQueueManager');
      const cases = [
        { ID: 41, attempts: 0, shouldRetry: true },
        { ID: 43, attempts: 3, shouldRetry: false },
      ];

      for (const { ID, attempts, shouldRetry } of cases) {
        jest.clearAllMocks();
        (retryQueueManager.getAttempts as jest.Mock).mockResolvedValueOnce(attempts);
        const keywordPlain = { ID, keyword: `retry-${ID}`, domain: 'example.com' };
        const keywordModel = {
          ...keywordPlain,
          get: jest.fn().mockReturnValue(keywordPlain),
          set: jest.fn(),
          update: jest.fn().mockResolvedValue(undefined),
        } as unknown as Keyword;

        (Domain.findAll as jest.Mock).mockResolvedValue([
          { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
        ]);
        (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce(false);

        await refreshAndUpdateKeywords([keywordModel], { scraper_type: 'custom-scraper', scrape_retry: true } as SettingsType);

        expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
        if (shouldRetry) {
          expect(retryScrape).toHaveBeenCalledWith(ID);
          expect(removeFromRetryQueue).not.toHaveBeenCalled();
        } else {
          expect(removeFromRetryQueue).toHaveBeenCalledWith(ID);
          expect(retryScrape).not.toHaveBeenCalledWith(ID);
        }
      }
    });

    it('with scrape_retry off, a failed scrape is never retried and always clears updating; sequential failures leave the retry queue', async () => {
      // custom-scraper runs sequentially, serpapi runs in parallel
      for (const scraper_type of ['custom-scraper', 'serpapi']) {
        jest.clearAllMocks();
        const keywordPlain = {
          ID: 42,
          keyword: 'no-retry',
          domain: 'example.com',
        };

        const keywordModel = {
          ...keywordPlain,
          get: jest.fn().mockReturnValue(keywordPlain),
          set: jest.fn(),
          update: jest.fn().mockResolvedValue(undefined),
        } as unknown as Keyword;

        (Domain.findAll as jest.Mock).mockResolvedValue([
          { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
        ]);

        (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce(false);

        const results = await refreshAndUpdateKeywords([keywordModel], { scraper_type, scrape_retry: false } as SettingsType);

        // We no longer call set() - Sequelize update handles model state
        expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
        expect(results[0].updating).toBe(false);
        expect(retryScrape).not.toHaveBeenCalled();
        if (scraper_type === 'custom-scraper') {
          expect(removeFromRetryQueue).toHaveBeenCalledWith(42);
        }
      }
    });

    it('applies per-domain scraper overrides when scraping keywords', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'override.com',
            scrapeEnabled: 1,
            scraper_settings: JSON.stringify({
              scraper_type: 'serpapi',
              scraping_api: cryptr.encrypt('domain-key'),
            }),
          }),
        },
      ]);

      const keywordPlain = {
        ID: 77,
        keyword: 'override keyword',
        domain: 'override.com',
        device: 'desktop',
        country: 'US',
        location: '',
        position: 0,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keywordModel = {
        ID: keywordPlain.ID,
        keyword: keywordPlain.keyword,
        domain: keywordPlain.domain,
        get: jest.fn().mockReturnValue(keywordPlain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValueOnce({
        ID: keywordPlain.ID,
        position: 3,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult);

      const settings = {
        scraper_type: 'custom-scraper',
        scrape_retry: false,
      } as SettingsType;

      await refreshAndUpdateKeywords([keywordModel], settings);

      expect(scrapeKeywordWithStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: 'override keyword' }),
        expect.objectContaining({ scraper_type: 'serpapi', scraping_api: 'domain-key' }),
        expect.objectContaining({}),
      );
    });

    it('clears updating state when a scrape rejects, for both sequential and parallel scrapers, and reuses desktop results for Serper mobile twins', async () => {
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      // custom-scraper runs sequentially, serpapi runs in parallel
      for (const scraper_type of ['custom-scraper', 'serpapi']) {
        jest.clearAllMocks();
        const keywordPlain = {
          ID: 55,
          keyword: 'parallel failure',
          domain: 'example.com',
          device: 'desktop',
          country: 'US',
          location: '',
          position: 4,
          volume: 0,
          updating: 1,
          sticky: 0,
          history: '{}',
          lastResult: '[]',
          lastUpdateError: 'false',
          lastUpdated: '2024-01-01T00:00:00.000Z',
          added: '2024-01-01T00:00:00.000Z',
          url: '',
          tags: '[]',
          mapPackTop3: false,
        };

        const keywordModel = {
          ID: keywordPlain.ID,
          keyword: keywordPlain.keyword,
          domain: keywordPlain.domain,
          get: jest.fn().mockReturnValue(keywordPlain),
          update: jest.fn().mockResolvedValue(undefined),
        } as unknown as Keyword;

        (scrapeKeywordWithStrategy as jest.Mock).mockRejectedValueOnce(new Error('scrape boom'));

        const settings = { scraper_type, scrape_retry: false } as SettingsType;
        const results = await refreshAndUpdateKeywords([keywordModel], settings);

        expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({
          updating: 0,
          updatingStartedAt: null,
          lastUpdateError: expect.stringContaining('scrape boom'),
        }));
        expect(results[0].updating).toBe(false);
      }

      // Serper cannot request mobile results, so a mobile keyword with a desktop twin in the batch reuses its result.
      const makeRow = (ID: number, keyword: string, device: string) => {
        const plain = {
          ID, keyword, domain: 'example.com', device, country: 'US', location: '', position: 0, volume: 0, updating: 1,
          sticky: 0, history: '{}', lastResult: '[]', lastUpdateError: 'false', lastUpdated: '2024-01-01T00:00:00.000Z',
          added: '2024-01-01T00:00:00.000Z', url: '', tags: '[]', mapPackTop3: false,
        };
        return { ...plain, get: jest.fn().mockReturnValue(plain), update: jest.fn().mockResolvedValue(undefined) } as unknown as Keyword;
      };
      const serperSettings = { scraper_type: 'serper', scrape_retry: false } as SettingsType;
      (Domain.findAll as jest.Mock).mockResolvedValue([{ get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) }]);

      // Failed desktop scrape: one scraper call, and the mobile twin records the same error and clears updating
      jest.clearAllMocks();
      const failedDesktop = makeRow(60, 'Twin Query', 'desktop');
      const failedMobile = makeRow(61, ' twin query ', 'mobile');
      (scrapeKeywordWithStrategy as jest.Mock).mockRejectedValueOnce(new Error('serper boom'));
      const failedResults = await refreshAndUpdateKeywords([failedDesktop, failedMobile], serperSettings);
      expect(scrapeKeywordWithStrategy).toHaveBeenCalledTimes(1);
      for (const row of [failedDesktop, failedMobile]) {
        expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
          updating: 0,
          updatingStartedAt: null,
          lastUpdateError: expect.stringContaining('serper boom'),
        }));
      }
      expect(failedResults.map((row) => row.ID).sort()).toEqual([60, 61]);
      expect(failedResults.every((row) => row.updating === false)).toBe(true);

      // Successful desktop scrape: the mobile twin gets the same position and is not scraped; a lone mobile keyword is scraped
      jest.clearAllMocks();
      const okDesktop = makeRow(62, 'Shared Query', 'desktop');
      const okMobile = makeRow(63, 'Shared Query', 'mobile');
      const loneMobile = makeRow(64, 'Lone Query', 'mobile');
      (scrapeKeywordWithStrategy as jest.Mock).mockImplementation(async (keyword: { ID: number }) => ({
        ID: keyword.ID, position: keyword.ID === 62 ? 3 : 5, result: [], localResults: [], mapPackTop3: false, error: false,
      }));
      const okResults = await refreshAndUpdateKeywords([okDesktop, okMobile, loneMobile], serperSettings);
      const scrapedIds = (scrapeKeywordWithStrategy as jest.Mock).mock.calls.map((call) => call[0].ID).sort();
      (scrapeKeywordWithStrategy as jest.Mock).mockReset();
      expect(scrapedIds).toEqual([62, 64]);
      expect(okDesktop.update).toHaveBeenCalledWith(expect.objectContaining({ position: 3, updating: 0 }));
      expect(okMobile.update).toHaveBeenCalledWith(expect.objectContaining({ position: 3, updating: 0, updatingStartedAt: null }));
      expect(loneMobile.update).toHaveBeenCalledWith(expect.objectContaining({ position: 5, updating: 0 }));
      expect(okResults.map((row) => [row.ID, row.position]).sort()).toEqual([[62, 3], [63, 3], [64, 5]]);
    });

    it('uses batched retry queue removal for improved performance', async () => {
      // Setup mock data with disabled domains
      const mockKeywords = [
        {
          ID: 1,
          domain: 'disabled1.com',
          get: jest.fn().mockReturnValue({ ID: 1, domain: 'disabled1.com' }),
          update: jest.fn().mockResolvedValue(undefined),
          set: jest.fn(),
          updating: 1,
        },
        {
          ID: 2,
          domain: 'disabled2.com',
          get: jest.fn().mockReturnValue({ ID: 2, domain: 'disabled2.com' }),
          update: jest.fn().mockResolvedValue(undefined),
          set: jest.fn(),
          updating: 1,
        },
        {
          ID: 3,
          domain: 'disabled3.com',
          get: jest.fn().mockReturnValue({ ID: 3, domain: 'disabled3.com' }),
          update: jest.fn().mockResolvedValue(undefined),
          set: jest.fn(),
          updating: 1,
        },
      ];

      // Mock domains with scrapeEnabled: 0 to trigger the skipped keywords path
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'disabled1.com', scrapeEnabled: 0 }) },
        { get: () => ({ domain: 'disabled2.com', scrapeEnabled: 0 }) },
        { get: () => ({ domain: 'disabled3.com', scrapeEnabled: 0 }) },
      ]);

      const { retryQueueManager } = require('../../utils/retryQueueManager');

      // Execute the function
      await refreshAndUpdateKeywords(mockKeywords as unknown as Keyword[], mockSettings);

      // Verify per-row updates were called (not bulk Keyword.update)
      // Each keyword instance should have its update method called
      expect(mockKeywords[0].update).toHaveBeenCalledWith(
        expect.objectContaining({ updating: 0, updatingStartedAt: null })
      );
      expect(mockKeywords[1].update).toHaveBeenCalledWith(
        expect.objectContaining({ updating: 0, updatingStartedAt: null })
      );
      expect(mockKeywords[2].update).toHaveBeenCalledWith(
        expect.objectContaining({ updating: 0, updatingStartedAt: null })
      );

      // Verify batched removal was called with the correct IDs
      expect(retryQueueManager.removeBatch).toHaveBeenCalledTimes(1);
      const callArg = retryQueueManager.removeBatch.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(Set);
      expect(Array.from(callArg).sort()).toEqual([1, 2, 3]);

      // Verify removeFromRetryQueue was NOT called (since we use batched operations now)
      expect(removeFromRetryQueue).not.toHaveBeenCalled();

      // With no skipped keywords, no retry queue removal happens at all
      jest.clearAllMocks();
      (scrapeKeywordWithStrategy as jest.Mock).mockReset();
      const enabledKeywords = [
        {
          ID: 1,
          domain: 'enabled.com',
          get: jest.fn().mockReturnValue({ ID: 1, domain: 'enabled.com' }),
          update: jest.fn().mockResolvedValue(undefined),
          set: jest.fn(),
        },
      ];
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'enabled.com', scrapeEnabled: 1 }) },
      ]);
      await refreshAndUpdateKeywords(enabledKeywords as unknown as Keyword[], mockSettings);
      expect(retryQueueManager.removeBatch).not.toHaveBeenCalled();
      expect(removeFromRetryQueue).not.toHaveBeenCalled();
    });

    it('normalises undefined scraper results before persisting', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const mockPlainKeyword = {
        ID: 42,
        keyword: 'example keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: 'US',
        position: 0,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        lastUpdateError: 'false',
      };

      const keywordModel = {
        ID: mockPlainKeyword.ID,
        keyword: mockPlainKeyword.keyword,
        domain: mockPlainKeyword.domain,
        get: jest.fn().mockReturnValue(mockPlainKeyword),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      const updatedKeyword = {
        ID: mockPlainKeyword.ID,
        position: 7,
        url: 'https://example.com/result',
        result: undefined,
        mapPackTop3: false,
        error: 'temporary failure',
      } as unknown as RefreshResult;

      const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

      // A failed scrape records the error and clears the flags, but leaves the stored results untouched
      expect(keywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          updating: 0,
          lastUpdateError: expect.stringContaining('temporary failure'),
        }),
      );
      const persistedPayload = (keywordModel.update as unknown as jest.Mock).mock.calls[0][0];
      expect(persistedPayload).not.toHaveProperty('lastResult');
      expect(persistedPayload).not.toHaveProperty('position');

      expect(updated.lastResult).toEqual([]);

      consoleSpy.mockRestore();
    });

    it('normalises array scraper results correctly', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const mockPlainKeyword = {
        ID: 43,
        keyword: 'test array keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: 'US',
        position: 0,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        lastUpdateError: 'false',
      };

      const keywordModel = {
        ID: mockPlainKeyword.ID,
        keyword: mockPlainKeyword.keyword,
        domain: mockPlainKeyword.domain,
        get: jest.fn().mockReturnValue(mockPlainKeyword),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      // Test with array result (this validates the simplified normalizeResult function)
      const arrayResult = [
        { position: 1, url: 'https://example.com', title: 'Test Result 1' },
        { position: 2, url: 'https://example2.com', title: 'Test Result 2' }
      ];

      const updatedKeyword = {
        ID: mockPlainKeyword.ID,
        position: 1,
        url: 'https://example.com',
        result: arrayResult,
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

      // Verify the array was properly JSON.stringified
      expect(keywordModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastResult: JSON.stringify(arrayResult),
        }),
      );

      // Verify the lastResult is parsed back to an array
      expect(updated.lastResult).toEqual(arrayResult);

      consoleSpy.mockRestore();
    });

    it('clears updating flag when keyword update fails and returns cleared state', async () => {
      const mockPlainKeyword = {
        ID: 44,
        keyword: 'failing update keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: 'US',
        position: 2,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        lastUpdateError: 'false',
      };

      const keywordModel = {
        ID: mockPlainKeyword.ID,
        keyword: mockPlainKeyword.keyword,
        domain: mockPlainKeyword.domain,
        get: jest.fn().mockReturnValue(mockPlainKeyword),
        update: jest.fn().mockRejectedValue(new Error('db update failed')),
        set: jest.fn(),
      } as unknown as Keyword;

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      const updatedKeyword = {
        ID: mockPlainKeyword.ID,
        position: 4,
        url: 'https://example.com/result',
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

      expect(keywordModel.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
      expect(updated.updating).toBe(false);
    });

    it('coerces optional scalars when scrape results omit URLs', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-05-20T12:00:00.000Z'));

      const mockPlainKeyword = {
        ID: 99,
        keyword: 'missing url keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: 'US',
        position: 11,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        url: 'https://example.com/existing',
        tags: '[]',
        lastUpdateError: 'false',
      };

      const keywordModel = {
        ID: mockPlainKeyword.ID,
        keyword: mockPlainKeyword.keyword,
        domain: mockPlainKeyword.domain,
        get: jest.fn().mockReturnValue(mockPlainKeyword),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      const updatedKeyword = {
        ID: mockPlainKeyword.ID,
        position: 5,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      try {
        await updateKeywordPosition(keywordModel, updatedKeyword, settings);

        expect(keywordModel.update).toHaveBeenCalledTimes(1);
        const payload = (keywordModel.update as jest.Mock).mock.calls[0][0];

        expect(payload.url).toBeNull();
        expect(payload.lastUpdated).toBe('2024-05-20T12:00:00.000Z');
        expect(payload.lastUpdateError).toBe('false');
        expect(payload.updating).toBe(0);
        expect(Object.values(payload).some((value) => value === undefined)).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('normalises legacy array history payloads before persisting new entries', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2024-05-20T12:00:00.000Z'));

      const mockPlainKeyword = {
        ID: 77,
        keyword: 'legacy history keyword',
        domain: 'example.com',
        device: 'desktop',
        country: 'US',
        location: 'US',
        position: 8,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '[]',
        lastResult: '[]',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        lastUpdateError: 'false',
      };

      const keywordModel = {
        ID: mockPlainKeyword.ID,
        keyword: mockPlainKeyword.keyword,
        domain: mockPlainKeyword.domain,
        get: jest.fn().mockReturnValue(mockPlainKeyword),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      const updatedKeyword = {
        ID: mockPlainKeyword.ID,
        position: 3,
        url: 'https://example.com/result',
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      try {
        const updated = await updateKeywordPosition(keywordModel, updatedKeyword, settings);

        expect(keywordModel.update).toHaveBeenCalledTimes(1);
        const payload = (keywordModel.update as jest.Mock).mock.calls[0][0];
        const storedHistory = JSON.parse(payload.history);

        expect(storedHistory).toEqual({ '2024-05-20': 3 });
        expect(updated.history).toEqual({ '2024-05-20': 3 });
      } finally {
        jest.useRealTimers();
      }
    });

    it('respects domain scraper overrides when determining parallel vs sequential mode', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);

      // Setup: global settings use parallel-friendly scraper (serpapi)
      // but domain override uses custom scraper (not parallel-friendly)
      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'parallel.com',
            scrapeEnabled: 1,
            scraper_settings: null, // No override - will use global serpapi
          }),
        },
        {
          get: () => ({
            domain: 'sequential.com',
            scrapeEnabled: 1,
            scraper_settings: JSON.stringify({
              scraper_type: 'custom-scraper',
              scraping_api: cryptr.encrypt('custom-key'),
            }),
          }),
        },
      ]);

      const keyword1Plain = {
        ID: 100,
        keyword: 'keyword1',
        domain: 'parallel.com',
        device: 'desktop',
        country: 'US',
        location: '',
        position: 1,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keyword2Plain = {
        ID: 101,
        keyword: 'keyword2',
        domain: 'sequential.com', // Has override to custom-scraper
        device: 'desktop',
        country: 'US',
        location: '',
        position: 2,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keywordModel1 = {
        ID: keyword1Plain.ID,
        keyword: keyword1Plain.keyword,
        domain: keyword1Plain.domain,
        get: jest.fn().mockReturnValue(keyword1Plain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      const keywordModel2 = {
        ID: keyword2Plain.ID,
        keyword: keyword2Plain.keyword,
        domain: keyword2Plain.domain,
        get: jest.fn().mockReturnValue(keyword2Plain),
        set: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      } as unknown as Keyword;

      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValue({
        ID: keyword1Plain.ID,
        position: 1,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult);

      const settings = {
        scraper_type: 'serpapi', // Global setting is parallel-friendly
        scrape_retry: false,
      } as SettingsType;

      // The refresh mode is reported in a debug message. Spy on the logger, because debug messages are not printed by default.
      const { logger } = require('../../utils/logger');
      const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();

      await refreshAndUpdateKeywords([keywordModel1, keywordModel2], settings);

      // Should use sequential mode because keyword2 has a custom-scraper override
      // which is not in the parallel-friendly list
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Keyword refresh completed'), expect.anything());
      expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Parallel keyword refresh completed'), expect.anything());

      debugSpy.mockRestore();
    });

    it('uses parallel mode when all domain overrides are parallel-friendly', async () => {
      const cryptr = new Cryptr(process.env.SECRET as string);

      // Setup: domain overrides use parallel-friendly scrapers
      (Domain.findAll as jest.Mock).mockResolvedValue([
        {
          get: () => ({
            domain: 'domain1.com',
            scrapeEnabled: 1,
            scraper_settings: JSON.stringify({
              scraper_type: 'serpapi',
              scraping_api: cryptr.encrypt('key1'),
            }),
          }),
        },
        {
          get: () => ({
            domain: 'domain2.com',
            scrapeEnabled: 1,
            scraper_settings: JSON.stringify({
              scraper_type: 'searchapi',
              scraping_api: cryptr.encrypt('key2'),
            }),
          }),
        },
      ]);

      const keyword1Plain = {
        ID: 200,
        keyword: 'parallel-keyword1',
        domain: 'domain1.com',
        device: 'desktop',
        country: 'US',
        location: '',
        position: 1,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keyword2Plain = {
        ID: 201,
        keyword: 'parallel-keyword2',
        domain: 'domain2.com',
        device: 'desktop',
        country: 'US',
        location: '',
        position: 2,
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdateError: 'false',
        lastUpdated: '2024-01-01T00:00:00.000Z',
        added: '2024-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        mapPackTop3: false,
      };

      const keywordModel1 = {
        ID: keyword1Plain.ID,
        keyword: keyword1Plain.keyword,
        domain: keyword1Plain.domain,
        get: jest.fn().mockReturnValue(keyword1Plain),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      const keywordModel2 = {
        ID: keyword2Plain.ID,
        keyword: keyword2Plain.keyword,
        domain: keyword2Plain.domain,
        get: jest.fn().mockReturnValue(keyword2Plain),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValue({
        ID: keyword1Plain.ID,
        position: 1,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult);

      const settings = {
        scraper_type: 'custom-scraper', // Global is NOT parallel-friendly
        scrape_retry: false,
      } as SettingsType;

      // The refresh mode is reported in a debug message. Spy on the logger, because debug messages are not printed by default.
      const { logger } = require('../../utils/logger');
      const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();

      await refreshAndUpdateKeywords([keywordModel1, keywordModel2], settings);

      // Should use parallel mode because both domain overrides are parallel-friendly
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Parallel keyword refresh completed'), expect.anything());
      expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('START SCRAPE:'), expect.anything());

      debugSpy.mockRestore();
    });

    it('handles various position input types correctly with simplified logic', async () => {
      // Test the simplified newPos logic: Number(updatedKeyword.position ?? keyword.position ?? 0) || 0
      const baseKeyword = {
        ID: 999,
        keyword: 'test keyword',
        domain: 'test.com',
        device: 'desktop',
        country: 'US',
        location: 'US',
        position: 5, // fallback position
        volume: 0,
        updating: 1,
        sticky: 0,
        history: '{}',
        lastResult: '[]',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        added: '2023-01-01T00:00:00.000Z',
        url: '',
        tags: '[]',
        lastUpdateError: 'false',
      };

      const keywordModel = {
        ID: baseKeyword.ID,
        keyword: baseKeyword.keyword,
        domain: baseKeyword.domain,
        get: jest.fn().mockReturnValue(baseKeyword),
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn(),
      } as unknown as Keyword;

      const settings = {
        scraper_type: 'serpapi',
        scrape_retry: false,
      } as SettingsType;

      // Test case 1: number position
      let updatedKeyword = {
        ID: baseKeyword.ID,
        position: 3,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      await updateKeywordPosition(keywordModel, updatedKeyword, settings);
      expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(3);

      // Test case 2: string number position
      (keywordModel.update as jest.Mock).mockClear();
      updatedKeyword = {
        ID: baseKeyword.ID,
        position: '7' as any,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      await updateKeywordPosition(keywordModel, updatedKeyword, settings);
      expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(7);

      // Test case 3: undefined position (should use keyword fallback)
      (keywordModel.update as jest.Mock).mockClear();
      updatedKeyword = {
        ID: baseKeyword.ID,
        position: undefined,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      await updateKeywordPosition(keywordModel, updatedKeyword, settings);
      expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(5); // fallback to keyword.position

      // Test case 4: null position (should use keyword fallback)
      (keywordModel.update as jest.Mock).mockClear();
      updatedKeyword = {
        ID: baseKeyword.ID,
        position: null as any,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      await updateKeywordPosition(keywordModel, updatedKeyword, settings);
      expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(5); // fallback to keyword.position

      // Test case 5: invalid string position (should use final fallback of 0)
      (keywordModel.update as jest.Mock).mockClear();
      const keywordWithUndefinedPos = { ...baseKeyword, position: undefined };
      (keywordModel.get as jest.Mock).mockReturnValue(keywordWithUndefinedPos);
      updatedKeyword = {
        ID: baseKeyword.ID,
        position: 'invalid' as any,
        result: [],
        mapPackTop3: false,
        error: false,
      } as unknown as RefreshResult;

      await updateKeywordPosition(keywordModel, updatedKeyword, settings);
      expect((keywordModel.update as jest.Mock).mock.calls[0][0].position).toBe(0); // final fallback
    });

  });

  describe('Atomic Flag Clearing in Refresh Workflow', () => {
    const mockSettings = {
      scraper_type: 'serpapi',
      scrape_retry: false,
    } as SettingsType;

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret';
    });

    describe('updateKeywordPosition atomic flag behavior', () => {
      it('clears the updating flag in a single atomic update, for both a successful and an error scrape', async () => {
        const cases: Array<{ ID: number; keyword: string; result: Record<string, unknown>; expectedPayload: Record<string, unknown> }> = [
          { ID: 1, keyword: 'test keyword', result: { position: 3, url: 'https://example.com', error: false }, expectedPayload: { position: 3 } },
          { ID: 2, keyword: 'error keyword', result: { position: 0, url: '', error: 'Scraper API error' }, expectedPayload: {} },
        ];

        for (const { ID, keyword, result, expectedPayload } of cases) {
          const mockKeywordModel = {
            ID,
            domain: 'example.com',
            keyword,
            updating: toDbBool(true),
            updatingStartedAt: new Date().toJSON(),
            get: jest.fn().mockReturnValue({
              ID,
              domain: 'example.com',
              keyword,
              position: 5,
              history: {},
              lastUpdated: '',
              url: '',
            }),
            update: jest.fn().mockResolvedValue(undefined),
          };

          await updateKeywordPosition(
            mockKeywordModel as unknown as Keyword,
            { ID, keyword, localResults: [], result: [], mapPackTop3: false, ...result } as unknown as RefreshResult,
            mockSettings
          );

          expect(mockKeywordModel.update).toHaveBeenCalledWith(
            expect.objectContaining({ updating: toDbBool(false), updatingStartedAt: null, ...expectedPayload })
          );
          // Only one update call per keyword (atomic)
          expect(mockKeywordModel.update).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe('Parallel refresh workflow atomic behavior', () => {
      it('should clear flags atomically for parallel scrapers', async () => {
        const mockKeywordModel1 = {
          ID: 6,
          domain: 'example.com',
          keyword: 'parallel keyword 1',
          updating: toDbBool(true),
          get: jest.fn().mockReturnValue({
            ID: 6,
            domain: 'example.com',
            keyword: 'parallel keyword 1',
            position: 0,
            history: {},
            lastUpdated: '',
            url: '',
          }),
          update: jest.fn().mockResolvedValue(undefined),
        };

        const mockKeywordModel2 = {
          ID: 7,
          domain: 'example.com',
          keyword: 'parallel keyword 2',
          updating: toDbBool(true),
          get: jest.fn().mockReturnValue({
            ID: 7,
            domain: 'example.com',
            keyword: 'parallel keyword 2',
            position: 0,
            history: {},
            lastUpdated: '',
            url: '',
          }),
          update: jest.fn().mockResolvedValue(undefined),
        };

        (Domain.findAll as jest.Mock).mockResolvedValue([
          {
            get: () => ({
              domain: 'example.com',
              scrapeEnabled: 1,
            }),
          },
        ]);

        // Mock parallel scraper
        (scrapeKeywordWithStrategy as jest.Mock)
          .mockResolvedValueOnce({
            ID: 6,
            keyword: 'parallel keyword 1',
            position: 1,
            url: 'https://example.com/1',
            result: [],
            localResults: [],
            mapPackTop3: false,
            error: false,
          })
          .mockResolvedValueOnce({
            ID: 7,
            keyword: 'parallel keyword 2',
            position: 2,
            url: 'https://example.com/2',
            result: [],
            localResults: [],
            mapPackTop3: false,
            error: false,
          });

        await refreshAndUpdateKeywords(
          [
            mockKeywordModel1 as unknown as Keyword,
            mockKeywordModel2 as unknown as Keyword,
          ],
          { ...mockSettings, scraper_type: 'serpapi' } // Parallel scraper
        );

        // Verify both keywords had their flags cleared atomically
        expect(mockKeywordModel1.update).toHaveBeenCalledWith(
          expect.objectContaining({
            updating: toDbBool(false),
            updatingStartedAt: null,
          })
        );
        expect(mockKeywordModel2.update).toHaveBeenCalledWith(
          expect.objectContaining({
            updating: toDbBool(false),
            updatingStartedAt: null,
          })
        );

        // Verify each keyword was only updated once (atomic)
        expect(mockKeywordModel1.update).toHaveBeenCalledTimes(1);
        expect(mockKeywordModel2.update).toHaveBeenCalledTimes(1);
      });
    });
  });

  // These tests mock the scraper, keyword and domain models differently from the suites above, so they load in an isolated registry.
  describe('refreshAndUpdateKeywords with a domain scraper key that cannot be decrypted', () => {
    const originalSecret = process.env.SECRET;
    let isoRefresh: any;
    let scrapeMock: jest.Mock;
    let queueMock: { removeBatch: jest.Mock };

    const makeDomain = (scraperSettings: string | null) => ({
      get: () => ({
        domain: 'example.com',
        scrapeEnabled: 1,
        scraper_settings: scraperSettings,
        business_name: null,
        scrape_strategy: '',
        scrape_pagination_limit: 0,
      }),
    });

    const makeKeyword = (id: number) => {
      const plain = { ID: id, keyword: `kw ${id}`, domain: 'example.com', device: 'desktop', country: 'US', location: '', position: 0, url: '', lastResult: [], history: {}, mapPackTop3: 0, tags: [], localResults: [], updating: 1, lastUpdateError: 'false', sticky: 0, volume: 0, history7d: null, lastUpdated: '', added: '', updatingStartedAt: null };
      return {
        ID: id,
        domain: 'example.com',
        get: () => plain,
        update: jest.fn().mockResolvedValue(undefined),
      };
    };

    beforeAll(() => {
      jest.resetModules();
      jest.doMock('../../utils/scraper', () => ({
        __esModule: true,
        RefreshResult: undefined,
        removeFromRetryQueue: jest.fn().mockResolvedValue(undefined),
        retryScrape: jest.fn().mockResolvedValue(undefined),
        scrapeKeywordWithStrategy: jest.fn(),
      }));
      jest.doMock('../../utils/updateDomainStats', () => ({
        __esModule: true,
        updateDomainStats: jest.fn().mockResolvedValue(undefined),
      }));
      jest.doMock('../../utils/retryQueueManager', () => ({
        __esModule: true,
        retryQueueManager: { removeBatch: jest.fn().mockResolvedValue(undefined), getAttempts: jest.fn().mockResolvedValue(0) },
      }));
      jest.doMock('../../database/models/keyword', () => ({
        __esModule: true,
        default: { findAll: jest.fn(), update: jest.fn() },
      }));
      jest.doMock('../../database/models/domain', () => ({
        __esModule: true,
        default: { findAll: jest.fn() },
      }));
      jest.isolateModules(() => {
        isoRefresh = require('../../utils/refresh').default;
        scrapeMock = require('../../utils/scraper').scrapeKeywordWithStrategy;
        queueMock = require('../../utils/retryQueueManager').retryQueueManager;
      });
    });

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.SECRET = 'test-secret-for-override';
    });

    afterEach(() => {
      if (originalSecret === undefined) {
        delete process.env.SECRET;
      } else {
        process.env.SECRET = originalSecret;
      }
    });

    it('does not scrape with the global key when a domain key is unreadable, records a clear error and removes the keywords from the retry queue', async () => {
      const encryptedForAnotherSecret = new Cryptr('some-other-secret').encrypt('serper-key');
      const domain = makeDomain(JSON.stringify({ scraper_type: 'serper', scraping_api: encryptedForAnotherSecret }));
      const keywords = [makeKeyword(1), makeKeyword(2)];

      await isoRefresh(keywords as any, { scraper_type: 'serpapi', scraping_api: 'global-key' } as any, [domain] as any);

      expect(scrapeMock).not.toHaveBeenCalled();
      keywords.forEach((keyword) => {
        expect(keyword.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 0, updatingStartedAt: null }));
        const payload = keyword.update.mock.calls[0][0];
        expect(JSON.parse(payload.lastUpdateError).error).toContain('could not be decrypted');
      });
      expect(queueMock.removeBatch).toHaveBeenCalledWith(new Set([1, 2]));
    });

    it('spaces parallel-path requests of a domain by scrape_delay', async () => {
      const domain = makeDomain(null);
      const starts: number[] = [];
      scrapeMock.mockImplementation(async (kw: any) => {
        starts.push(Date.now());
        return { ID: kw.ID, keyword: kw.keyword, position: 4, url: 'https://example.com/', result: [], mapPackTop3: false, error: false };
      });

      await isoRefresh([makeKeyword(11), makeKeyword(12), makeKeyword(13)] as any, { scraper_type: 'serpapi', scraping_api: 'k', scrape_delay: '100' } as any, [domain] as any);

      expect(starts).toHaveLength(3);
      expect(starts[2] - starts[0]).toBeGreaterThanOrEqual(180);
    });

    it('only sends the global key to a same-provider override or a domain without one; a keyless override of another provider gets an empty key', async () => {
      const cases = [
        { id: 9, domainSettings: JSON.stringify({ scraper_type: 'serper', scraping_api: null }), expected: { scraper_type: 'serper', scraping_api: '' } },
        { id: 10, domainSettings: JSON.stringify({ scraper_type: 'serpapi', scraping_api: null }), expected: { scraper_type: 'serpapi', scraping_api: 'global-key' } },
        { id: 3, domainSettings: null, expected: { scraper_type: 'serpapi', scraping_api: 'global-key' } },
      ];

      for (const { id, domainSettings, expected } of cases) {
        scrapeMock.mockClear();
        scrapeMock.mockResolvedValue({ ID: id, keyword: `kw ${id}`, position: 4, url: 'https://example.com/', result: [], mapPackTop3: false, error: false });

        await isoRefresh([makeKeyword(id)] as any, { scraper_type: 'serpapi', scraping_api: 'global-key' } as any, [makeDomain(domainSettings)] as any);

        expect(scrapeMock).toHaveBeenCalledTimes(1);
        expect(scrapeMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(expected), expect.anything());
      }
    });
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
      const executionOrder: number[] = [];
      const releases = Array.from({ length: 4 }, deferred);
      const fourthStarted = deferred();
      const tasks = releases.map((release, index) => jest.fn(async () => {
        executionOrder.push(index + 1);
        if (index === 3) fourthStarted.resolve();
        await release.promise;
      }));

      for (const [index, task] of tasks.entries()) {
        await refreshQueue.enqueue(`task${index + 1}`, task);
      }

      try {
        expect(executionOrder).toEqual([1, 2, 3]);
        expect(tasks[3]).not.toHaveBeenCalled();
        releases[0].resolve();
        await fourthStarted.promise;
        expect(executionOrder).toEqual([1, 2, 3, 4]);
      } finally {
        releases.forEach((release) => release.resolve());
        await yieldToQueue();
      }
      tasks.forEach((task) => expect(task).toHaveBeenCalledTimes(1));
    });

    it('respects per-domain locking', async () => {
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

      await refreshQueue.enqueue('task-a1', domainATask1, ['domainA']);
      await refreshQueue.enqueue('task-a2', domainATask2, ['domainA']);
      await refreshQueue.enqueue('task-b', domainBTask, ['domainB']);

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
        await yieldToQueue();
      }
      expect(domainATask1).toHaveBeenCalledTimes(1);
      expect(domainATask2).toHaveBeenCalledTimes(1);
      expect(domainBTask).toHaveBeenCalledTimes(1);
    });



    it('atomically locks every domain in a task while allowing unrelated work', async () => {
      const order: string[] = [];
      const gate = deferred();
      const aStarted = deferred();
      const bStarted = deferred();

      await refreshQueue.enqueue('multi', async () => { order.push('AB-start'); await gate.promise; order.push('AB-end'); }, ['A', 'B', 'a', '']);
      await refreshQueue.enqueue('only-a', async () => { order.push('A-start'); aStarted.resolve(); }, ['A']);
      await refreshQueue.enqueue('only-b', async () => { order.push('B-start'); bStarted.resolve(); }, ['B']);
      await refreshQueue.enqueue('only-c', async () => { order.push('C-start'); }, ['C']);

      try {
        expect(refreshQueue.isDomainLocked('A')).toBe(true);
        expect(refreshQueue.isDomainLocked('B')).toBe(true);
        expect(order).toContain('C-start');
        expect(order).not.toContain('A-start');
        expect(order).not.toContain('B-start');
        gate.resolve();
        await Promise.all([aStarted.promise, bStarted.promise]);
        expect(order.indexOf('A-start')).toBeGreaterThan(order.indexOf('AB-end'));
        expect(order.indexOf('B-start')).toBeGreaterThan(order.indexOf('AB-end'));
      } finally {
        gate.resolve();
        await yieldToQueue();
      }
    });

    it('continues processing after task failure', async () => {
      const executionOrder: number[] = [];
      const releaseFirst = deferred();
      const thirdStarted = deferred();
      refreshQueue.setMaxConcurrency(1);
      const task1 = jest.fn(async () => { executionOrder.push(1); await releaseFirst.promise; });
      const task2 = jest.fn(async () => {
        executionOrder.push(2);
        throw new Error('Task 2 failed');
      });
      const task3 = jest.fn(async () => { executionOrder.push(3); thirdStarted.resolve(); });

      try {
        await refreshQueue.enqueue('task1', task1);
        await refreshQueue.enqueue('task2', task2);
        await refreshQueue.enqueue('task3', task3);
        expect(executionOrder).toEqual([1]);

        releaseFirst.resolve();
        await thirdStarted.promise;
        expect(executionOrder).toEqual([1, 2, 3]);
        expect(task1).toHaveBeenCalledTimes(1);
        expect(task2).toHaveBeenCalledTimes(1);
        expect(task3).toHaveBeenCalledTimes(1);
      } finally {
        releaseFirst.resolve();
        refreshQueue.setMaxConcurrency(3);
        await yieldToQueue();
      }
    });

    it('returns correct queue status', async () => {
      const gate = deferred();
      const taskStarted = deferred();
      const longRunningTask = jest.fn(async () => { taskStarted.resolve(); await gate.promise; });

      await refreshQueue.enqueue('long-task', longRunningTask, ['testDomain']);
      await taskStarted.promise;
      const status = refreshQueue.getStatus();
      gate.resolve();
      await yieldToQueue();

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

describe('settings file lock', () => {
  /* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */


  describe('withSettingsLock', () => {
    let dir: string;
    let cwdSpy: jest.SpyInstance;

    beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-lock-'));
      mkdirSync(path.join(dir, 'data'));
      cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
    });

    afterEach(() => {
      cwdSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    });

    it('creates settings.json as {} when it is missing', async () => {
      await withSettingsLock(async () => undefined);

      expect(readFileSync(path.join(dir, 'data', 'settings.json'), 'utf-8')).toBe('{}');
    });

    it('runs overlapping critical sections one after the other', async () => {
      writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');
      const order: string[] = [];
      const releaseFirst = deferred();
      const firstStarted = deferred();
      const section = (name: string) => withSettingsLock(async () => {
        order.push(`${name}:start`);
        if (name === 'a') {
          firstStarted.resolve();
          await releaseFirst.promise;
        }
        order.push(`${name}:end`);
      });

      const first = section('a');
      await firstStarted.promise;
      const second = section('b');
      try {
        expect(order).toEqual(['a:start']);
        releaseFirst.resolve();
        await Promise.all([first, second]);
        expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
      } finally {
        releaseFirst.resolve();
        await Promise.all([first, second]);
      }
    });

    it('releases the lock when the section throws', async () => {
      writeFileSync(path.join(dir, 'data', 'settings.json'), '{}');

      await expect(withSettingsLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      await expect(withSettingsLock(async () => 'next')).resolves.toBe('next');
      expect(existsSync(path.join(dir, 'data', 'settings.json'))).toBe(true);
    });
  });

  describe('readSettingsFile', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-read-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('reads a missing, empty or whitespace-only file as {}', async () => {
      const file = path.join(dir, 'settings.json');
      await expect(readSettingsFile(file)).resolves.toEqual({});
      writeFileSync(file, '');
      await expect(readSettingsFile(file)).resolves.toEqual({});
      writeFileSync(file, '   ');
      await expect(readSettingsFile(file)).resolves.toEqual({});
    });

    it('throws for non-empty invalid JSON instead of reading it as {}', async () => {
      const file = path.join(dir, 'settings.json');
      writeFileSync(file, '{"scraping_api": "enc", ');
      await expect(readSettingsFile(file)).rejects.toThrow(/not valid JSON/);
      writeFileSync(file, '[1,2]');
      await expect(readSettingsFile(file)).rejects.toThrow(/JSON object/);
    });

    it('returns the stored settings', async () => {
      const file = path.join(dir, 'settings.json');
      writeFileSync(file, '{"scraper_type":"none"}');
      await expect(readSettingsFile(file)).resolves.toEqual({ scraper_type: 'none' });
    });
  });
});
