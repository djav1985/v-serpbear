import type { NextApiRequest } from 'next';

describe('domains route', () => {
  let readFile: any;
  let unlink: any;
  let handler: any;
  let db: any;
  let Domain: any;
  let Keyword: any;
  let verifyUser: any;
  let removeLocalSCData: any;
  let retryQueueManager: any;
  let atomicWriteFile: any;
  let refreshQueue: any;
  let createMockResponse: any;
  jest.isolateModules(() => {
    jest.doMock('../../../database/database', () => ({
      __esModule: true,
      default: { sync: jest.fn(), transaction: jest.fn() },
    }));
    jest.doMock('../../../database/init', () => ({
      __esModule: true,
      ensureDatabase: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../../../database/models/domain', () => ({
      __esModule: true,
      default: { findOne: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn() },
    }));
    jest.doMock('../../../database/models/keyword', () => ({
      __esModule: true,
      default: { destroy: jest.fn(), findAll: jest.fn() },
    }));
    jest.doMock('../../../utils/verifyUser', () => ({
      __esModule: true,
      default: jest.fn(),
    }));
    jest.doMock('../../../utils/searchConsole', () => ({
      __esModule: true,
      checkSearchConsoleIntegration: jest.fn(() => ({ isValid: true })),
      removeLocalSCData: jest.fn(),
    }));
    jest.doMock('../../../utils/retryQueueManager', () => ({ retryQueueManager: { removeBatch: jest.fn() } }));
    jest.doMock('../../../utils/atomicWrite', () => ({ atomicWriteFile: jest.fn() }));
    jest.doMock('fs/promises', () => ({ readFile: jest.fn(), mkdir: jest.fn().mockResolvedValue(undefined), unlink: jest.fn().mockResolvedValue(undefined) }));
    jest.doMock('../../../utils/fileLock', () => ({ withFileLock: (_path: string, section: () => Promise<unknown>) => section() }));
    jest.doMock('../../../utils/refreshQueue', () => ({
      refreshQueue: {
        enqueue: jest.fn(async (_taskId: string, task: () => Promise<void>) => { await task(); }),
        isDomainLocked: jest.fn(() => false),
        reserveDomains: jest.fn(() => jest.fn()),
      },
    }));
    jest.doMock('../../../utils/apiLogging', () => require('../../__helpers__/apiLoggingMock').apiLoggingMock());
    const m1 = require('fs/promises');
    readFile = m1.readFile;
    unlink = m1.unlink;
    const m2 = require('../../__helpers__/routeAdapter').asModule(require('../../../app/api/serp/domains/route'));
    handler = m2 && m2.__esModule ? m2.default : m2;
    const m3 = require('../../../database/database');
    db = m3 && m3.__esModule ? m3.default : m3;
    const m4 = require('../../../database/models/domain');
    Domain = m4 && m4.__esModule ? m4.default : m4;
    const m5 = require('../../../database/models/keyword');
    Keyword = m5 && m5.__esModule ? m5.default : m5;
    const m6 = require('../../../utils/verifyUser');
    verifyUser = m6 && m6.__esModule ? m6.default : m6;
    const m7 = require('../../../utils/searchConsole');
    removeLocalSCData = m7.removeLocalSCData;
    const m8 = require('../../../utils/retryQueueManager');
    retryQueueManager = m8.retryQueueManager;
    const m9 = require('../../../utils/atomicWrite');
    atomicWriteFile = m9.atomicWriteFile;
    const m10 = require('../../../utils/refreshQueue');
    refreshQueue = m10.refreshQueue;
    const m11 = require('../../__helpers__');
    createMockResponse = m11.createMockResponse;
  });

  const verifyUserMock = verifyUser as unknown as jest.Mock;
  const dbMock = db as unknown as { sync: jest.Mock; transaction: jest.Mock };
  const DomainMock = Domain as unknown as { findOne: jest.Mock; destroy: jest.Mock; bulkCreate: jest.Mock; findAll: jest.Mock };
  const KeywordMock = Keyword as unknown as { destroy: jest.Mock; findAll: jest.Mock };
  const removeLocalSCDataMock = removeLocalSCData as unknown as jest.Mock;
  const removeBatchMock = retryQueueManager.removeBatch as jest.Mock;
  const readFileMock = readFile as unknown as jest.Mock;
  const unlinkMock = unlink as unknown as jest.Mock;
  const atomicWriteFileMock = atomicWriteFile as jest.Mock;
  const refreshQueueMock = refreshQueue as unknown as { enqueue: jest.Mock; isDomainLocked: jest.Mock; reserveDomains: jest.Mock };

  describe('DELETE /api/serp/domains', () => {
    const request = (domain = 'example.com') => ({ method: 'DELETE', query: {}, body: { domain }, headers: {} } as unknown as NextApiRequest);
    let cleanupState = '{}';
    beforeEach(() => {
      jest.clearAllMocks();
      verifyUserMock.mockReturnValue('authorized');
      dbMock.transaction.mockImplementation(async (callback: (transaction: object) => Promise<void>) => callback({ id: 'tx' }));
      DomainMock.findOne.mockResolvedValue({ ID: 1 });
      DomainMock.destroy.mockResolvedValue(1);
      KeywordMock.destroy.mockResolvedValue(2);
      KeywordMock.findAll.mockResolvedValue([{ ID: 10 }, { ID: 11 }]);
      removeBatchMock.mockResolvedValue(undefined);
      removeLocalSCDataMock.mockResolvedValue(true);
      cleanupState = '{}';
      readFileMock.mockImplementation(async (path: string) => {
        if (path.includes('domain_cleanup_retry.json')) {
          return cleanupState;
        }
        const error = new Error('ENOENT') as Error & { code?: string };
        error.code = 'ENOENT';
        throw error;
      });
      atomicWriteFileMock.mockImplementation(async (_path: string, content: string) => {
        cleanupState = content;
      });
      refreshQueueMock.enqueue.mockImplementation(async (_taskId: string, task: () => Promise<void>) => { await task(); });
    });

    it('removes the domain ideas file, and a missing ideas file does not fail the delete', async () => {
      unlinkMock.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
      const res = createMockResponse(); await handler(request(), res);
      expect(unlinkMock).toHaveBeenCalledWith(expect.stringMatching(/IDEAS_example\.com\.json$/));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ domainRemoved: 1, cleanup: { complete: true, failed: [], retryPending: false } }));
    });

    it('retries an earlier delete whose cleanup failed, and drops its entry once the retry succeeds', async () => {
      cleanupState = JSON.stringify({ 'older.example': [7] });
      const res = createMockResponse(); await handler(request(), res);
      expect(removeBatchMock).toHaveBeenCalledWith(new Set([7]));
      expect(removeLocalSCDataMock).toHaveBeenCalledWith('older.example');
      expect(JSON.parse(cleanupState)).toEqual({});
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 409 with a retry message and deletes nothing while a refresh holds the domain', async () => {
      refreshQueueMock.reserveDomains.mockReturnValueOnce(null);
      const res = createMockResponse(); await handler(request(), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: expect.stringMatching(/Try again once the refresh has finished/) }),
      }));
      expect(DomainMock.destroy).not.toHaveBeenCalled();
      expect(refreshQueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('returns 404 when the target domain is missing', async () => {
      DomainMock.findOne.mockResolvedValue(null);
      KeywordMock.findAll.mockResolvedValueOnce([]);
      const res = createMockResponse(); await handler(request('missing.example.com'), res);
      expect(DomainMock.destroy).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deletes keywords before the domain in one transaction and reports accurate counts', async () => {
      const order: string[] = [];
      KeywordMock.destroy.mockImplementation(async () => { order.push('keywords'); return 2; });
      DomainMock.destroy.mockImplementation(async () => { order.push('domain'); return 1; });
      const res = createMockResponse(); await handler(request(), res);
      expect(order).toEqual(['keywords', 'domain']);
      expect(KeywordMock.destroy).toHaveBeenCalledWith(expect.objectContaining({ transaction: { id: 'tx' } }));
      expect(DomainMock.destroy).toHaveBeenCalledWith(expect.objectContaining({ transaction: { id: 'tx' } }));
      expect(refreshQueueMock.enqueue).toHaveBeenCalledWith(expect.stringContaining('delete-domain-example.com-'), expect.any(Function), ['example.com'], { reservations: [expect.any(Function)] });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ domainRemoved: 1, keywordsRemoved: 2, cleanup: { complete: true, failed: [], retryPending: false } }));
    });

    it('does not run auxiliary cleanup when keyword or domain deletion fails', async () => {
      for (const stage of ['keyword', 'domain']) {
        jest.clearAllMocks();
        if (stage === 'keyword') KeywordMock.destroy.mockRejectedValueOnce(new Error('keyword failure'));
        else DomainMock.destroy.mockRejectedValueOnce(new Error('domain failure'));
        const res = createMockResponse(); await handler(request(), res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(removeBatchMock).not.toHaveBeenCalled();
        expect(removeLocalSCDataMock).not.toHaveBeenCalled();
      }
    });

    it('reports auxiliary failures and permits idempotent cleanup retry', async () => {
      removeBatchMock.mockRejectedValueOnce(new Error('file busy'));
      removeLocalSCDataMock.mockRejectedValueOnce(new Error('file busy'));
      const first = createMockResponse(); await handler(request('retry.example'), first);
      expect(first.json).toHaveBeenCalledWith(expect.objectContaining({ cleanup: { complete: false, failed: ['retryQueue', 'searchConsole'], retryPending: true } }));

      DomainMock.findOne.mockResolvedValue(null);
      KeywordMock.findAll.mockResolvedValueOnce([]);
      KeywordMock.destroy.mockResolvedValueOnce(0);
      DomainMock.destroy.mockResolvedValueOnce(0);
      const second = createMockResponse(); await handler(request('retry.example'), second);
      expect(second.status).toHaveBeenCalledWith(200);
      expect(second.json).toHaveBeenCalledWith(expect.objectContaining({ domainRemoved: 0, keywordsRemoved: 0, cleanup: { complete: true, failed: [], retryPending: false } }));
      expect(removeBatchMock).toHaveBeenCalledTimes(2);
    });

    it('treats false return from local Search Console cleanup as an explicit cleanup failure', async () => {
      removeLocalSCDataMock.mockResolvedValueOnce(false);
      const res = createMockResponse(); await handler(request('cleanup-false.example'), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        cleanup: { complete: false, failed: ['searchConsole'], retryPending: true },
        SCDataRemoved: false,
      }));
    });
  });
});
