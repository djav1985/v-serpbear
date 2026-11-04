jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../database/init', () => ({
  ensureDatabase: jest.fn().mockResolvedValue(undefined),
}));

import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp } from '../../utils/api/clientIp';
import { redactSecrets, redactUrl } from '../../utils/logRedaction';

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

    res.setHeader = jest.fn().mockReturnThis();

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

    // Verify debug logging for request details
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('API Request Details'),
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        body: undefined,
      })
    );
  });

  it('does NOT log body when LOG_LEVEL is not debug', async () => {
    delete process.env.LOG_LEVEL;
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('withApiLogging accepts only name option (no logBody)', async () => {
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    // Should compile and run with name only (no logBody option)
    const wrapped = withApiLogging(handler, { name: 'test-route' });
    const res = createResponse();
    await wrapped(createRequest(), res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[test-route]'));
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

  it('calls ensureDatabase before executing the handler', async () => {
    const { withApiLogging } = await import('../../utils/apiLogging');
    const { ensureDatabase } = require('../../database/init') as { ensureDatabase: jest.Mock };

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    // Verify ensureDatabase was called
    expect(ensureDatabase).toHaveBeenCalled();
    
    // Verify ensureDatabase was called before the handler
    const ensureDatabaseCallOrder = ensureDatabase.mock.invocationCallOrder[0];
    const handlerCallOrder = handler.mock.invocationCallOrder[0];
    expect(ensureDatabaseCallOrder).toBeLessThan(handlerCallOrder);
  });

  it('sets X-Request-Id response header on every request', async () => {
    const { withApiLogging } = await import('../../utils/apiLogging');

    const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);
    const res = createResponse();

    await wrapped(createRequest(), res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
  });

  it('exposes requestId on req object for downstream handlers', async () => {
    const { withApiLogging } = await import('../../utils/apiLogging');
    let capturedRequestId: string | undefined;

    const handler = jest.fn(async (req: NextApiRequest, res: NextApiResponse) => {
      capturedRequestId = (req as any).requestId;
      res.status(200).json({ ok: true });
    });

    const wrapped = withApiLogging(handler);

    await wrapped(createRequest(), createResponse());

    expect(capturedRequestId).toBeDefined();
    expect(typeof capturedRequestId).toBe('string');
    expect(capturedRequestId!.length).toBeGreaterThan(0);
  });
});

describe('redactSecrets', () => {
  it('redacts passwords, tokens, API keys and private keys', () => {
    expect(redactSecrets({
      password: 'a', smtp_password: 'b', scraping_api: 'c', refresh_token: 'd', private_key: 'e', apiKey: 'f', adwords_client_secret: 'g', Authorization: 'h',
    })).toEqual({
      password: '[REDACTED]', smtp_password: '[REDACTED]', scraping_api: '[REDACTED]', refresh_token: '[REDACTED]', private_key: '[REDACTED]', apiKey: '[REDACTED]', adwords_client_secret: '[REDACTED]', Authorization: '[REDACTED]',
    });
  });

  it('does not treat keyword fields as secrets', () => {
    expect(redactSecrets({ keyword: 'running shoes', keywords: ['a'], keywordID: 4, domain: 'example.com' }))
      .toEqual({ keyword: 'running shoes', keywords: ['a'], keywordID: 4, domain: 'example.com' });
  });

  it('walks nested objects and arrays, and leaves empty strings and non-strings alone', () => {
    expect(redactSecrets({ settings: { smtp_password: 'x', smtp_port: 587 }, list: [{ token: 't' }], password: '' }))
      .toEqual({ settings: { smtp_password: '[REDACTED]', smtp_port: 587 }, list: [{ token: '[REDACTED]' }], password: '' });
  });

  it('redacts extra keys such as the OAuth code and state only when asked', () => {
    expect(redactSecrets({ code: 'abc', state: 'xyz', domain: 'a.com' })).toEqual({ code: 'abc', state: 'xyz', domain: 'a.com' });
    expect(redactSecrets({ code: 'abc', state: 'xyz', domain: 'a.com' }, ['code', 'state'])).toEqual({ code: '[REDACTED]', state: '[REDACTED]', domain: 'a.com' });
  });

  it('does not change the input', () => {
    const input = { password: 'a' };
    redactSecrets(input);
    expect(input.password).toBe('a');
  });
});

describe('redactUrl', () => {
  it('hides OAuth code and state values', () => {
    expect(redactUrl('/api/adwords?code=4/abc&state=xyz&x=1')).toBe('/api/adwords?code=[REDACTED]&state=[REDACTED]&x=1');
    expect(redactUrl(undefined)).toBe('');
  });
});

describe('getClientIp', () => {
  const makeReq = (headers: Record<string, string | string[]>, remoteAddress = '10.0.0.9') => (
    { headers, socket: { remoteAddress } } as unknown as NextApiRequest
  );

  const original = process.env.TRUST_PROXY;
  afterEach(() => {
    if (original === undefined) { delete process.env.TRUST_PROXY; } else { process.env.TRUST_PROXY = original; }
  });

  it('uses the socket address by default and ignores a forwarded header', () => {
    delete process.env.TRUST_PROXY;
    expect(getClientIp(makeReq({ 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.9');
  });

  it('reads the entry one hop from the right when TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true';
    // the client-supplied first entry is ignored; our proxy appended the last one
    expect(getClientIp(makeReq({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5' }))).toBe('203.0.113.5');
  });

  it('honours a hop count', () => {
    process.env.TRUST_PROXY = '2';
    expect(getClientIp(makeReq({ 'x-forwarded-for': '6.6.6.6, 203.0.113.5, 172.16.0.1' }))).toBe('203.0.113.5');
  });

  it('falls back to the socket address when the entry is missing or not an IP', () => {
    process.env.TRUST_PROXY = '1';
    expect(getClientIp(makeReq({}))).toBe('10.0.0.9');
    expect(getClientIp(makeReq({ 'x-forwarded-for': 'not-an-ip' }))).toBe('10.0.0.9');
    process.env.TRUST_PROXY = '3';
    expect(getClientIp(makeReq({ 'x-forwarded-for': '203.0.113.5' }))).toBe('10.0.0.9');
  });

  it('returns unknown without a socket address', () => {
    delete process.env.TRUST_PROXY;
    expect(getClientIp({ headers: {} } as unknown as NextApiRequest)).toBe('unknown');
  });
});
