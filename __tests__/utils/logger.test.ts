import { Logger, LogLevel } from '../../app/utils/logger';

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

  describe('logSuccessEvents configuration', () => {
    it('should enable success event logging by default when LOG_SUCCESS_EVENTS is undefined', () => {
      delete process.env.LOG_SUCCESS_EVENTS;
      
      const logger = new Logger();
      
      // Test by calling authEvent with success=true
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Auth Event: test_event"')
      );
    });

    it('should disable success event logging when LOG_SUCCESS_EVENTS is "false"', () => {
      process.env.LOG_SUCCESS_EVENTS = 'false';
      
      const logger = new Logger();
      
      // Test by calling authEvent with success=true
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should disable success event logging when LOG_SUCCESS_EVENTS is "0"', () => {
      process.env.LOG_SUCCESS_EVENTS = '0';
      
      const logger = new Logger();
      
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should disable success event logging when LOG_SUCCESS_EVENTS is "off"', () => {
      process.env.LOG_SUCCESS_EVENTS = 'off';
      
      const logger = new Logger();
      
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should enable success event logging when LOG_SUCCESS_EVENTS is "true"', () => {
      process.env.LOG_SUCCESS_EVENTS = 'true';
      
      const logger = new Logger();
      
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Auth Event: test_event"')
      );
    });

    it('should enable success event logging when LOG_SUCCESS_EVENTS is "1"', () => {
      process.env.LOG_SUCCESS_EVENTS = '1';
      
      const logger = new Logger();
      
      logger.authEvent('test_event', 'test_user', true);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Auth Event: test_event"')
      );
    });

    it('should always log failure events regardless of logSuccessEvents setting', () => {
      process.env.LOG_SUCCESS_EVENTS = 'false';
      
      const logger = new Logger();
      
      // Test by calling authEvent with success=false
      logger.authEvent('test_event', 'test_user', false);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"level":"WARN"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Auth Event Failed: test_event"')
      );
    });
  });

  describe('apiRequest success event logging', () => {
    it('should log successful API requests when logSuccessEvents is enabled', () => {
      process.env.LOG_SUCCESS_EVENTS = 'true';
      
      const logger = new Logger();
      
      logger.apiRequest('GET', '/test', 200, 100);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"API Request: GET /test"')
      );
    });

    it('should not log successful API requests when logSuccessEvents is disabled', () => {
      process.env.LOG_SUCCESS_EVENTS = 'false';
      
      const logger = new Logger();
      
      logger.apiRequest('GET', '/test', 200, 100);
      
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should always log error API requests regardless of logSuccessEvents setting', () => {
      process.env.LOG_SUCCESS_EVENTS = 'false';
      
      const logger = new Logger();
      
      logger.apiRequest('GET', '/test', 404, 100);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"message":"API Request Failed: GET /test"')
      );
    });
  });
});
