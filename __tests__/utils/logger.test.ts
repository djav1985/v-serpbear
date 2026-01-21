import { Logger } from '../../utils/logger';

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

    it('should disable all logging when LOG_LEVEL is "none"', () => {
      process.env.LOG_LEVEL = 'none';
      
      const logger = new Logger();
      
      logger.error('test error message');
      logger.warn('test warn message');
      logger.info('test info message');
      logger.debug('test debug message');
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should disable all logging when LOG_LEVEL is "false"', () => {
      process.env.LOG_LEVEL = 'false';
      
      const logger = new Logger();
      
      logger.error('test error message');
      logger.warn('test warn message');
      logger.info('test info message');
      logger.debug('test debug message');
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should disable all logging when LOG_LEVEL is "0"', () => {
      process.env.LOG_LEVEL = '0';
      
      const logger = new Logger();
      
      logger.error('test error message');
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should disable all logging when LOG_LEVEL is "off"', () => {
      process.env.LOG_LEVEL = 'off';
      
      const logger = new Logger();
      
      logger.info('test info message');
      expect(mockConsoleLog).not.toHaveBeenCalled();
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

    it('should log ERROR, WARN, and INFO when LOG_LEVEL is "info"', () => {
      process.env.LOG_LEVEL = 'info';
      
      const logger = new Logger();
      
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      
      expect(mockConsoleLog).toHaveBeenCalledTimes(3);
      
      mockConsoleLog.mockClear();
      logger.debug('test debug');
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should log all levels when LOG_LEVEL is "debug"', () => {
      process.env.LOG_LEVEL = 'debug';
      
      const logger = new Logger();
      
      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');
      
      expect(mockConsoleLog).toHaveBeenCalledTimes(4);
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
    it('should log successful auth events at INFO level', () => {
      process.env.LOG_LEVEL = 'info';
      
      const logger = new Logger();
      
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Auth: test_event [test_user]"')
      );
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

  describe('apiRequest logging', () => {
    it('should log successful API requests at INFO level', () => {
      process.env.LOG_LEVEL = 'info';
      
      const logger = new Logger();
      
      logger.apiRequest('GET', '/test', 200, 100);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"API Request: GET /test - 200 (100ms)"')
      );
    });

    it('should not log successful API requests when LOG_LEVEL is error', () => {
      process.env.LOG_LEVEL = 'error';
      
      const logger = new Logger();
      
      logger.apiRequest('GET', '/test', 200, 100);
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should always log error API requests at ERROR level', () => {
      process.env.LOG_LEVEL = 'info';
      
      const logger = new Logger();
      
      logger.apiRequest('GET', '/test', 404, 100);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"API Request Failed: GET /test - 404"')
      );
    });
  });
});
