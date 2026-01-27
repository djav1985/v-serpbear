import type { NextApiRequest, NextApiResponse } from 'next';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('withApiLogging', () => {
  const { logger } = require('../../utils/logger') as {
    logger: {
      info: jest.Mock;
      warn: jest.Mock;
      error: jest.Mock;
      debug: jest.Mock;
    };
  };

  const createRequest = (): NextApiRequest => ({
    method: 'GET',
    url: '/api/test',
    headers: {},
    query: {},
  } as unknown as NextApiRequest);

  const createResponse = (): NextApiResponse => {
    const res: Partial<NextApiResponse> & { statusCode: number; headersSent: boolean } = {
      statusCode: 200,
      headersSent: false,
    };

    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res as NextApiResponse;
    });

    res.writeHead = jest.fn((code: number) => {
      res.statusCode = code;
      return res as NextApiResponse;
    });

    res.json = jest.fn((body: unknown) => {
      void body;
      res.headersSent = true;
      return res as NextApiResponse;
    });

    res.end = jest.fn(() => {
      res.headersSent = true;
      return res as NextApiResponse;
    });

    return res as NextApiResponse;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    delete process.env.LOG_LEVEL;
  });

  it('enables body logging when LOG_LEVEL is DEBUG (case-insensitive)', async () => {
    process.env.LOG_LEVEL = 'DEBUG';
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('API Request Details'),
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        body: undefined,
      })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('API Response Details'),
      expect.objectContaining({
        statusCode: 200,
        responseBody: { ok: true },
      })
    );
  });

  it('logs warning severity when handler sets res.statusCode directly', async () => {
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.statusCode = 404;
      res.end();
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test - 404'),
      expect.objectContaining({
        statusCode: 404,
      })
    );
  });

  it('logs warning severity when handler uses writeHead', async () => {
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.writeHead(418);
      res.end();
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test - 418'),
      expect.objectContaining({
        statusCode: 418,
      })
    );
  });
});
