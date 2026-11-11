import type { NextApiRequest, NextApiResponse } from 'next';
import { asHandler } from '../__helpers__/routeAdapter';
import * as handlerRoute from '../../app/api/serp/refresh/route';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import verifyUser, { hasValidSessionCookie } from '../../utils/verifyUser';
import refreshAndUpdateKeywords, { refreshKeywordsByIds } from '../../utils/refresh';
import { getAppSettings } from '../../utils/appSettings';
import { scrapeKeywordWithStrategy } from '../../utils/scraper';
import { isSameOriginRequest } from '../../utils/api/sameOrigin';
import { resetRateLimits } from '../../utils/rateLimit';
const handler = asHandler(handlerRoute);

jest.mock('../../database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));
jest.mock('../../database/models/keyword', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), update: jest.fn() },
}));
jest.mock('../../database/models/domain', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../utils/verifyUser');
jest.mock('../../utils/appSettings', () => ({
  __esModule: true,
  getAppSettings: jest.fn(),
}));
jest.mock('../../utils/refresh', () => {
  const actual = jest.requireActual('../../utils/refresh');
  return {
    __esModule: true,
    ...actual,
    default: jest.fn(),
    refreshKeywordsByIds: jest.fn(),
  };
});
jest.mock('../../utils/scraper', () => ({
  scrapeKeywordWithStrategy: jest.fn(),
  retryScrape: jest.fn(),
  removeFromRetryQueue: jest.fn(),
}));
jest.mock('../../utils/apiLogging', () => require('../__helpers__/apiLoggingMock').apiLoggingMock());
jest.mock('../../utils/refreshQueue', () => ({
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
      const { refreshQueue } = require('../../utils/refreshQueue');
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
jest.mock('../../utils/logger', () => ({
   logger: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
   },
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
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }).setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
      req.method = 'POST';
      req.query = {};
      req.body = undefined;
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      (db.sync as jest.Mock).mockResolvedValue(undefined);
      (verifyUser as jest.Mock).mockReturnValue('authorized');
      (hasValidSessionCookie as jest.Mock).mockReturnValue(true);
      (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'serpapi' });
      (refreshKeywordsByIds as jest.Mock).mockResolvedValue([]);
    });

    it('refuses a refresh started from another site', async () => {
      expect(isSameOriginRequest(new Request('https://app.example/api/serp/refresh', { headers: { origin: 'https://app.example', 'sec-fetch-site': 'same-origin' } }))).toBe(true);
      expect(isSameOriginRequest(new Request('http://internal/api/serp/refresh', { headers: { origin: 'https://public.example', 'x-forwarded-host': 'public.example', 'x-forwarded-proto': 'https' } }))).toBe(true);

      jest.clearAllMocks();
      const crossSiteReq = {
        method: 'POST',
        body: { ids: [11] },
        headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
      } as unknown as NextApiRequest;
      const crossSiteRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(crossSiteReq, crossSiteRes);

      expect(crossSiteRes.status).toHaveBeenCalledWith(403);
      expect(Keyword.findAll).not.toHaveBeenCalled();
      expect(refreshKeywordsByIds).not.toHaveBeenCalled();
    });

    it('refuses a keyword search that uses an API key instead of a login session', async () => {
      jest.clearAllMocks();
      (hasValidSessionCookie as jest.Mock).mockReturnValueOnce(false);
      const apiKeySearchReq = {
        method: 'POST',
        body: { keyword: 'widgets', country: 'US' },
        headers: { authorization: 'Bearer test-api-key' },
      } as unknown as NextApiRequest;
      const apiKeySearchRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as NextApiResponse;

      await handler(apiKeySearchReq, apiKeySearchRes);

      expect(apiKeySearchRes.status).toHaveBeenCalledWith(403);
      expect(scrapeKeywordWithStrategy).not.toHaveBeenCalled();
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

    it('requires IDs and rejects malformed IDs when reading retry status', async () => {
      for (const query of [{ status: 'retry' }, { status: 'retry', id: '0,11' }]) {
        req.method = 'GET';
        req.query = query;
        const statusRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

        await handler(req, statusRes);

        expect(statusRes.status).toHaveBeenCalledWith(400);
        expect(Keyword.findAll).not.toHaveBeenCalled();
      }
    });

    it('returns an internal error when retry status cannot be read from storage', async () => {
      req.method = 'GET';
      req.query = { status: 'retry', id: '11' };
      (Keyword.findAll as jest.Mock).mockRejectedValue(new Error('database unavailable'));

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }) }));
    });

    it('rejects requests with no valid keyword IDs', async () => {
      req.body = { ids: ['abc', 'NaN'] };

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'No valid keyword IDs provided' }),
      }));
      expect(Keyword.findAll).not.toHaveBeenCalled();
    });

    it.each([
      ['ids is not an array', { ids: '11' }],
      ['ids contains a non-positive value', { ids: [11, 0] }],
    ])('rejects a malformed JSON ID list when %s', async (_label, body) => {
      const malformedReq = { method: 'POST', body, headers: {} } as unknown as NextApiRequest;
      const malformedRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

      await handler(malformedReq, malformedRes);

      expect(malformedRes.status).toHaveBeenCalledWith(400);
      expect(malformedRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ message: 'No valid keyword IDs provided' }) }));
      expect(Keyword.findAll).not.toHaveBeenCalled();
    });

    it('requires a domain for an all-keywords refresh and reports an unconfigured scraper', async () => {
      const allWithoutDomain = { method: 'POST', body: { scope: 'domain' }, headers: {} } as unknown as NextApiRequest;
      const missingDomainRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(allWithoutDomain, missingDomainRes);
      expect(missingDomainRes.status).toHaveBeenCalledWith(400);

      (getAppSettings as jest.Mock).mockResolvedValue({ scraper_type: 'none' });
      const regularReq = { method: 'POST', body: { ids: [11] }, headers: {} } as unknown as NextApiRequest;
      const unconfiguredRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(regularReq, unconfiguredRes);
      expect(unconfiguredRes.status).toHaveBeenCalledWith(400);
      expect(Keyword.findAll).not.toHaveBeenCalled();
    });

    it('starts the scheduled refresh for enabled domains through the refresh route', async () => {
      req.body = { scope: 'enabled-domains' };
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'enabled.com', scrapeEnabled: 1 }) },
        { get: () => ({ domain: 'disabled.com', scrapeEnabled: 0 }) },
      ]);
      const keyword = {
        ID: 21,
        domain: 'enabled.com',
        updating: 0,
        update: jest.fn().mockImplementation(function(this: any, values: Record<string, unknown>) {
          Object.assign(this, values);
          return Promise.resolve(undefined);
        }),
        set: jest.fn(),
      };
      (Keyword.findAll as jest.Mock).mockResolvedValue([keyword]);

      await handler(req, res);
      await jest.runAllTimersAsync();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ started: true });
      expect(Domain.findAll).toHaveBeenCalledTimes(1);
      expect(Keyword.findAll).toHaveBeenCalledWith({ where: { domain: 'enabled.com' } });
      expect(keyword.update).toHaveBeenCalledWith(expect.objectContaining({ updating: 1 }));
      expect(refreshAndUpdateKeywords).toHaveBeenCalledWith([keyword], { scraper_type: 'serpapi' }, expect.any(Array));
    });

    it('rejects an unknown refresh scope and conflicting selection filters', async () => {
      for (const query of [
        { scope: 'unknown' },
        { scope: 'enabled-domains', id: '12' },
      ]) {
        const invalidReq = { method: 'POST', query, headers: {} } as unknown as NextApiRequest;
        const invalidRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

        await handler(invalidReq, invalidRes);

        expect(invalidRes.status).toHaveBeenCalledWith(400);
      }
      expect(Domain.findAll).not.toHaveBeenCalled();
      expect(Keyword.findAll).not.toHaveBeenCalled();
    });

    it('rejects GET requests that do not ask for retry status', async () => {
      req.method = 'GET';
      req.query = {};

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'METHOD_NOT_ALLOWED' }) }));
    });

    it('starts refresh in background and returns 202 immediately', async () => {
      req.body = { ids: [1] };

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

      (refreshKeywordsByIds as jest.Mock).mockRejectedValue(new Error('scraper failed'));

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
      req.body = { ids: [1, 2] };

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
      (refreshKeywordsByIds as jest.Mock).mockResolvedValue(refreshedKeywords);

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
      expect(refreshKeywordsByIds).toHaveBeenCalledTimes(1);
      expect(refreshKeywordsByIds).toHaveBeenCalledWith([keywordRecord1.ID, keywordRecord2.ID], { scraper_type: 'serpapi' });
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
        method: 'POST',
        body: { keyword: 'widgets', country: 'US', ...deviceQuery },
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

    it('validates preview input and reports an upstream scrape failure', async () => {
      const invalidReq = { method: 'POST', body: { keyword: '', country: 'US' }, headers: {} } as unknown as NextApiRequest;
      const invalidRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      await handler(invalidReq, invalidRes);
      expect(invalidRes.status).toHaveBeenCalledWith(400);
      expect(scrapeKeywordWithStrategy).not.toHaveBeenCalled();

      const failedReq = { method: 'POST', body: { keyword: 'widgets', country: 'US' }, headers: {} } as unknown as NextApiRequest;
      const failedRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValue({ error: 'provider unavailable' });
      await handler(failedReq, failedRes);
      expect(failedRes.status).toHaveBeenCalledWith(502);
      expect(failedRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'BAD_GATEWAY' }) }));
    });

    it('returns 500 when the preview provider rejects its request', async () => {
      (scrapeKeywordWithStrategy as jest.Mock).mockRejectedValue(new Error('provider request failed'));
      const previewReq = { method: 'POST', body: { keyword: 'widgets', country: 'US' }, headers: {} } as unknown as NextApiRequest;
      const previewRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;

      await handler(previewReq, previewRes);

      expect(previewRes.status).toHaveBeenCalledWith(500);
      expect(previewRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR' }) }));
    });

    it('rate-limits paid keyword previews after twenty requests from the same client', async () => {
      resetRateLimits();
      (scrapeKeywordWithStrategy as jest.Mock).mockResolvedValue({ keyword: 'widgets', position: 1, result: [], error: false });
      try {
        for (let index = 0; index < 20; index += 1) {
          const previewReq = { method: 'POST', body: { keyword: 'widgets', country: 'US' }, headers: {} } as unknown as NextApiRequest;
          const previewRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
          await handler(previewReq, previewRes);
          expect(previewRes.status).toHaveBeenCalledWith(200);
        }
        const limitedReq = { method: 'POST', body: { keyword: 'widgets', country: 'US' }, headers: {} } as unknown as NextApiRequest;
        const limitedRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as NextApiResponse;
        await handler(limitedReq, limitedRes);

        expect(limitedRes.status).toHaveBeenCalledWith(429);
        expect(limitedRes.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'TOO_MANY_REQUESTS' }) }));
        expect(scrapeKeywordWithStrategy).toHaveBeenCalledTimes(20);
      } finally {
        resetRateLimits();
      }
    });

    it('rejects manual refresh when domain is already locked', async () => {
      req.body = { ids: [1] };

      const keywordRecord = { ID: 1, domain: 'example.com', update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      (Keyword.findAll as jest.Mock).mockResolvedValue([keywordRecord]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'example.com', scrapeEnabled: 1 }) },
      ]);

      // Mock domain as locked
      // Once for the atomic reservation check of the only domain
      const { refreshQueue } = require('../../utils/refreshQueue');
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
      req.body = { ids: [1, 2] };
      const freeKeyword = { ID: 1, domain: 'free.com', updating: 0, update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      const busyKeyword = { ID: 2, domain: 'busy.com', updating: 0, update: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
      (Keyword.findAll as jest.Mock).mockResolvedValue([freeKeyword, busyKeyword]);
      (Domain.findAll as jest.Mock).mockResolvedValue([
        { get: () => ({ domain: 'free.com', scrapeEnabled: 1 }) },
        { get: () => ({ domain: 'busy.com', scrapeEnabled: 1 }) },
      ]);

      const { refreshQueue } = require('../../utils/refreshQueue');
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
      expect(refreshKeywordsByIds).toHaveBeenCalledWith([freeKeyword.ID], expect.anything());
    });

    it('restarts a keyword whose updating flag is stale, but skips one that is still live', async () => {
      req.body = { ids: [1, 2] };
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
      expect(refreshKeywordsByIds).toHaveBeenCalledWith([staleKeyword.ID], expect.anything());
    });

    it('handles keywords with domains missing from Domain table', async () => {
      req.body = { ids: [1, 2] };

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

      // Should NOT call refreshKeywordsByIds
      expect(refreshKeywordsByIds).not.toHaveBeenCalled();
    });

    it('handles mixed scenario with some domains missing and some present', async () => {
      req.body = { ids: [1, 2, 3] };

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
      req.body = { ids: [1, 2, 3] };

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
      (refreshKeywordsByIds as jest.Mock).mockRejectedValue(new Error('Scraping failed'));

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
      req.body = { ids: [1, 2] };

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

      // refreshKeywordsByIds should not be called
      expect(refreshKeywordsByIds).not.toHaveBeenCalled();
    });

    afterEach(() => {
      jest.clearAllMocks();
      jest.useRealTimers();
    });
  });
});
