import type { NextApiRequest, NextApiResponse } from 'next';
import { getClientIp } from '../utils/api/clientIp';
import { redactSecrets, redactUrl } from '../utils/logRedaction';

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('../database/init', () => ({
  ensureDatabase: jest.fn().mockResolvedValue(undefined),
}));

describe('logger', () => {
  // utils/logger is mocked for the API logging tests below; these tests need the real class.
  const { Logger } = jest.requireActual('../utils/logger') as typeof import('../utils/logger');
  // Mock console.log to prevent output during tests
  const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

  describe('Logger', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = process.env;
      mockConsoleLog.mockClear();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe('LOG_LEVEL configuration', () => {
      it('should default to INFO level when LOG_LEVEL is undefined', () => {
        delete process.env.LOG_LEVEL;

        const logger = new Logger();

        logger.info('test info message');
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"INFO"')
        );

        mockConsoleLog.mockClear();
        logger.debug('test debug message');
        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should disable all logging for "none", "false", "0" and "off"', () => {
        for (const level of ['none', 'false', '0', 'off']) {
          process.env.LOG_LEVEL = level;
          mockConsoleLog.mockClear();

          const logger = new Logger();

          logger.error('test error message');
          logger.warn('test warn message');
          logger.info('test info message');
          logger.debug('test debug message');

          expect(mockConsoleLog).not.toHaveBeenCalled();
        }
      });

      it('should only log errors when LOG_LEVEL is "error"', () => {
        process.env.LOG_LEVEL = 'error';

        const logger = new Logger();

        logger.error('test error message');
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"ERROR"')
        );

        mockConsoleLog.mockClear();
        logger.warn('test warn message');
        expect(mockConsoleLog).not.toHaveBeenCalled();

        logger.info('test info message');
        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should log every level up to the configured threshold', () => {
        // info logs ERROR, WARN and INFO (not DEBUG); debug logs all four.
        const cases: Array<[string, number]> = [['info', 3], ['debug', 4]];
        for (const [level, expectedCalls] of cases) {
          process.env.LOG_LEVEL = level;
          mockConsoleLog.mockClear();

          const logger = new Logger();

          logger.error('test error');
          logger.warn('test warn');
          logger.info('test info');
          logger.debug('test debug');

          expect(mockConsoleLog).toHaveBeenCalledTimes(expectedCalls);
        }
      });

      it('should be case insensitive for LOG_LEVEL', () => {
        process.env.LOG_LEVEL = 'DEBUG';

        const logger = new Logger();

        logger.debug('test debug message');
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"DEBUG"')
        );
      });
    });

    describe('authEvent logging', () => {
      it('should log successful auth events at INFO level with structured metadata', () => {
        process.env.LOG_LEVEL = 'info';

        const logger = new Logger();

        logger.authEvent('test_event', 'test_user', true);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"INFO"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Auth: test_event [test_user]"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"event":"test_event"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"user":"test_user"')
        );
      });

      it('should include extra meta fields in successful auth event logs', () => {
        process.env.LOG_LEVEL = 'info';

        const logger = new Logger();

        logger.authEvent('login', 'alice', true, { ip: '1.2.3.4' });

        const call = mockConsoleLog.mock.calls[0][0];
        const parsed = JSON.parse(call);
        expect(parsed.level).toBe('INFO');
        expect(parsed.meta).toMatchObject({ event: 'login', user: 'alice', ip: '1.2.3.4' });
      });

      it('should not log successful auth events when LOG_LEVEL is error', () => {
        process.env.LOG_LEVEL = 'error';

        const logger = new Logger();

        logger.authEvent('test_event', 'test_user', true);

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should always log failed auth events at WARN level', () => {
        process.env.LOG_LEVEL = 'info';

        const logger = new Logger();

        logger.authEvent('test_event', 'test_user', false);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"WARN"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"message":"Auth Failed: test_event"')
        );
      });
    });

  });
});

describe('api logging', () => {
  describe('withApiLogging', () => {
    const { logger } = require('../utils/logger') as {
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

    it('logs request details at debug level only when LOG_LEVEL is DEBUG (case-insensitive)', async () => {
      const { withApiLogging } = await import('../utils/apiLogging');

      const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
        res.status(200).json({ ok: true });
      });

      const wrapped = withApiLogging(handler);

      // Verify debug logging for request details
      process.env.LOG_LEVEL = 'DEBUG';
      await wrapped(createRequest(), createResponse());
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('API Request Details'),
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          body: undefined,
        })
      );

      // Without DEBUG, no debug logging happens
      delete process.env.LOG_LEVEL;
      logger.debug.mockClear();
      await wrapped(createRequest(), createResponse());
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('withApiLogging accepts only name option (no logBody)', async () => {
      const { withApiLogging } = await import('../utils/apiLogging');

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

    it('logs warning severity when handler sets res.statusCode directly or uses writeHead', async () => {
      const { withApiLogging } = await import('../utils/apiLogging');

      const directHandler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
        res.statusCode = 404;
        res.end();
      });
      await withApiLogging(directHandler)(createRequest(), createResponse());
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/test - 404'),
        expect.objectContaining({
          statusCode: 404,
        })
      );

      const writeHeadHandler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
        res.writeHead(418);
        res.end();
      });
      await withApiLogging(writeHeadHandler)(createRequest(), createResponse());
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/test - 418'),
        expect.objectContaining({
          statusCode: 418,
        })
      );
    });

    it('calls ensureDatabase before executing the handler', async () => {
      const { withApiLogging } = await import('../utils/apiLogging');
      const { ensureDatabase } = require('../database/init') as { ensureDatabase: jest.Mock };

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

    it('refuses a locked address only for Bearer attempts without a valid session', async () => {
      const { withApiLogging } = await import('../utils/apiLogging');
      const { recordLoginFailure, resetLoginThrottle } = await import('../utils/loginThrottle');
      const { getApiKeyAttemptKeys } = await import('../utils/apiKeyThrottle');
      const handler = jest.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
        res.status(200).json({ ok: true });
      });
      const wrapped = withApiLogging(handler);
      const buildRequest = (authorization: string) => ({ ...createRequest(), headers: { authorization }, socket: { remoteAddress: '198.51.100.7' } } as unknown as NextApiRequest);
      resetLoginThrottle();
      const keys = getApiKeyAttemptKeys(buildRequest('Bearer x'));
      for (let i = 0; i < 6; i += 1) { recordLoginFailure(keys); }

      const bearerRes = createResponse();
      await wrapped(buildRequest('Bearer wrong'), bearerRes);
      expect(bearerRes.status).toHaveBeenCalledWith(429);
      expect(handler).not.toHaveBeenCalled();

      const basicRes = createResponse();
      await wrapped(buildRequest('Basic dXNlcjpwYXNz'), basicRes);
      expect(basicRes.status).toHaveBeenCalledWith(200);
      resetLoginThrottle();
    });

    it('exposes requestId on req object for downstream handlers', async () => {
      const { withApiLogging } = await import('../utils/apiLogging');
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
});
