import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../app/pages/api/domains';
import db from '../../app/database/database';
import Domain from '../../app/database/models/domain';
import verifyUser from '../../app/utils/verifyUser';

jest.mock('../../app/database/database', () => ({
  __esModule: true,
  default: { sync: jest.fn() },
}));

jest.mock('../../app/database/models/domain', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../../app/utils/verifyUser', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../../app/utils/apiLogging', () => ({
  __esModule: true,
  withApiLogging: (apiHandler: any) => apiHandler,
}));

const verifyUserMock = verifyUser as unknown as jest.Mock;
const dbMock = db as unknown as { sync: jest.Mock };
const DomainMock = Domain as unknown as { findOne: jest.Mock };

const createMockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
}) as unknown as NextApiResponse;

describe('PUT /api/domains', () => {
  let domainState: {
    domain: string;
    slug: string;
    scrape_enabled: boolean;
    notification: boolean;
  };
  let domainInstance: {
    get: jest.Mock;
    set: jest.Mock;
    save: jest.Mock;
  };
  let persistedSnapshots: Array<{ scrape_enabled: number; notification: number }>;

  beforeEach(() => {
    jest.clearAllMocks();
    verifyUserMock.mockReturnValue('authorized');
    dbMock.sync.mockResolvedValue(undefined);

    persistedSnapshots = [];
    domainState = {
      domain: 'toggle-test.example.com',
      slug: 'toggle-test-slug',
      scrape_enabled: true,
      notification: true,
    };

    domainInstance = {
      get: jest.fn(() => ({ ...domainState })),
      set: jest.fn((updates: Partial<typeof domainState>) => {
        Object.assign(domainState, updates);
      }),
      save: jest.fn().mockImplementation(async () => {
        persistedSnapshots.push({
          scrape_enabled: Number(domainState.scrape_enabled),
          notification: Number(domainState.notification),
        });
        return domainInstance;
      }),
    };

    DomainMock.findOne.mockResolvedValue(domainInstance);
  });

  it('persists scrape_enabled toggles and keeps notification in sync', async () => {
    const disableReq = {
      method: 'PUT',
      query: { domain: domainState.domain },
      body: { scrape_enabled: false },
      headers: {},
    } as unknown as NextApiRequest;
    const disableRes = createMockResponse();

    await handler(disableReq, disableRes);

    expect(dbMock.sync).toHaveBeenCalledTimes(1);
    expect(DomainMock.findOne).toHaveBeenCalledWith({ where: { domain: domainState.domain } });
    expect(domainInstance.set).toHaveBeenCalledWith(expect.objectContaining({
      scrape_enabled: false,
      notification: false,
    }));
    expect(domainInstance.save).toHaveBeenCalledTimes(1);
    expect(disableRes.status).toHaveBeenCalledWith(200);

    const disablePayload = (disableRes.json as jest.Mock).mock.calls[0][0];
    expect(disablePayload.domain).toBe(domainInstance);
    expect(domainState.scrape_enabled).toBe(false);
    expect(domainState.notification).toBe(false);
    expect(persistedSnapshots[0]).toEqual({ scrape_enabled: 0, notification: 0 });

    const enableReq = {
      method: 'PUT',
      query: { domain: domainState.domain },
      body: { scrape_enabled: true },
      headers: {},
    } as unknown as NextApiRequest;
    const enableRes = createMockResponse();

    await handler(enableReq, enableRes);

    expect(DomainMock.findOne).toHaveBeenCalledTimes(2);
    expect(domainInstance.set).toHaveBeenLastCalledWith(expect.objectContaining({
      scrape_enabled: true,
      notification: true,
    }));
    expect(domainInstance.save).toHaveBeenCalledTimes(2);
    expect(enableRes.status).toHaveBeenCalledWith(200);

    const enablePayload = (enableRes.json as jest.Mock).mock.calls[0][0];
    expect(enablePayload.domain).toBe(domainInstance);
    expect(domainState.scrape_enabled).toBe(true);
    expect(domainState.notification).toBe(true);
    expect(persistedSnapshots[1]).toEqual({ scrape_enabled: 1, notification: 1 });
  });
});
