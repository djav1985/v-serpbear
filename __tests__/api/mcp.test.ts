export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/mcp';
import verifyUser from '../../utils/verifyUser';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../utils/verifyUser', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: any) => fn }));
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({ StreamableHTTPServerTransport: jest.fn() }));

const originalApiKey = process.env.APIKEY;

const call = async (method: string) => {
  const req = createMockRequest({
    method,
    body: {},
    headers: { authorization: 'Bearer test-key' },
    socket: { localPort: 3000 },
  } as unknown as Partial<NextApiRequest>);
  const res = createMockResponse();
  await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

describe('/api/mcp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APIKEY = 'test-key';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.APIKEY;
    } else {
      process.env.APIKEY = originalApiKey;
    }
  });

  it('returns 405 for a GET request', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');

    const res = await call('GET');

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 401 for a POST when verifyUser does not authorize', async () => {
    (verifyUser as jest.Mock).mockReturnValue('Invalid API key.');

    const res = await call('POST');

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 500 for an authorized POST when APIKEY is unset', async () => {
    (verifyUser as jest.Mock).mockReturnValue('authorized');
    delete process.env.APIKEY;

    const res = await call('POST');

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
