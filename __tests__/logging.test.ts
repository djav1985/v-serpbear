
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    authEvent: jest.fn(),
  },
}));
jest.mock('../database/init', () => ({
  ensureDatabase: jest.fn().mockResolvedValue(undefined),
}));

describe('logger', () => {
  // utils/logger is mocked for the API logging tests below; these tests need the real class.
  const { Logger } = jest.requireActual('../utils/logger') as typeof import('../utils/logger');
  describe('Logger', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let mockConsoleLog: jest.SpyInstance;

    beforeEach(() => {
      originalEnv = { ...process.env };
      process.env = { ...originalEnv };
      mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
      mockConsoleLog.mockClear();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      mockConsoleLog.mockRestore();
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
      it('should log successful auth events at DEBUG level with structured metadata', () => {
        process.env.LOG_LEVEL = 'debug';

        const logger = new Logger();

        logger.authEvent('test_event', 'test_user', true);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"DEBUG"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"message":"[API] test_event [test_user]"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"event":"test_event"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"user":"test_user"')
        );
      });

      it('should include extra meta fields in successful auth event logs', () => {
        process.env.LOG_LEVEL = 'debug';

        const logger = new Logger();

        logger.authEvent('login', 'alice', true, { ip: '1.2.3.4' });

        const call = mockConsoleLog.mock.calls[0][0];
        const parsed = JSON.parse(call);
        expect(parsed.level).toBe('DEBUG');
        expect(parsed.meta).toMatchObject({ event: 'login', user: 'alice', ip: '1.2.3.4' });
      });

      it('should not log successful auth events when LOG_LEVEL is info', () => {
        process.env.LOG_LEVEL = 'info';

        const logger = new Logger();

        logger.authEvent('test_event', 'test_user', true);

        expect(mockConsoleLog).not.toHaveBeenCalled();
      });

      it('should log failed auth events at DEBUG level', () => {
        process.env.LOG_LEVEL = 'debug';

        const logger = new Logger();

        logger.authEvent('test_event', 'test_user', false);

        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"level":"DEBUG"')
        );
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('"message":"[API] test_event"')
        );
      });
    });

  });
});
