import type { NextApiRequest, NextApiResponse } from 'next';

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    isSuccessLoggingEnabled: jest.fn(() => false),
  },
}));

describe('withApiLogging success verbosity toggle', () => {
  const { logger } = require('../../utils/logger') as {
    logger: {
      info: jest.Mock;
      warn: jest.Mock;
      error: jest.Mock;
      isSuccessLoggingEnabled: jest.Mock;
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

    res.json = jest.fn((body: unknown) => {
      void body;
      res.headersSent = true;
      return res as NextApiResponse;
    });

    return res as NextApiResponse;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suppresses informational logs when success logging is disabled', async () => {
    logger.isSuccessLoggingEnabled.mockReturnValue(false);
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    // Should log request start but not completion for successful requests
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test')
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('200'),
      expect.any(Object)
    );
    expect(handler).toHaveBeenCalled();
  });

  it('emits informational logs when enabled or explicitly overridden', async () => {
    logger.isSuccessLoggingEnabled.mockReturnValue(true);
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test')
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('200')
    );

    logger.info.mockClear();
    logger.isSuccessLoggingEnabled.mockReturnValue(false);

    const wrappedWithOverride = withApiLogging(handler, { logSuccess: true });
    await wrappedWithOverride(createRequest(), createResponse());

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test')
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('200')
    );
  });

  it('continues to emit warnings for error responses when success logging is disabled', async () => {
    logger.isSuccessLoggingEnabled.mockReturnValue(false);
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(400).json({ error: 'bad request' });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test')
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('200'),
      expect.any(Object)
    );
  });

  it('continues to emit errors for server errors when success logging is disabled', async () => {
    logger.isSuccessLoggingEnabled.mockReturnValue(false);
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(500).json({ error: 'internal server error' });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/test')
    );
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('200'),
      expect.any(Object)
    );
  });
});
