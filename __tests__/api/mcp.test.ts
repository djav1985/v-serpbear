export {};

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/mcp';
import { createMockRequest, createMockResponse } from '../__helpers__';

jest.mock('../../utils/apiLogging', () => ({ withApiLogging: (fn: any) => fn }));
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: jest.fn() }));
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({ StreamableHTTPServerTransport: jest.fn() }));

const originalApiKey = process.env.APIKEY;

const call = async (method: string, headers: Record<string, string> = { authorization: 'Bearer test-key' }) => {
  const req = createMockRequest({
    method,
    body: {},
    headers,
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
    const res = await call('GET');

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it.each([
    ['no Authorization header', { cookie: 'token=anything' }],
    ['a wrong Bearer key', { authorization: 'Bearer wrong-key' }],
    ['a non-Bearer scheme', { authorization: 'Basic test-key' }],
  ])('returns 401 when the request has %s, even with a session cookie', async (_name, headers) => {
    const res = await call('POST', headers as Record<string, string>);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 500 for an authorized POST when APIKEY is unset', async () => {
    delete process.env.APIKEY;

    const res = await call('POST');

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
