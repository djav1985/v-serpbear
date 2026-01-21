/**
 * Enhanced logging utility for SerpBear
 * Provides structured logging with different levels and Docker-friendly output
 * 
 * All logs are output to stdout (console.log) in JSON format for Docker container logging.
 * Docker will capture these logs and they can be viewed with: docker logs <container>
 * 
 * Log Levels:
 * - none: Disables all logging
 * - info: Logs high-level operational messages, including key actions and success or failure states (default)
 * - error: Logs detailed error information, including context needed for troubleshooting
 * - debug: Logs full diagnostic output, including API requests, responses, and internal processing details
 * 
 * Example log output:
 * {"timestamp":"2026-01-21T06:00:00.000Z","level":"INFO","message":"GET /api/domains - 200 (150ms)"}
 */

export enum LogLevel {
  NONE = -1,  // No logging
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private logLevel: LogLevel;

  constructor() {
    // Set log level from environment or default to INFO
    const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
    
    // Support for disabling logging: none, false, 0, off
    if (envLogLevel === 'none' || envLogLevel === 'false' || envLogLevel === '0' || envLogLevel === 'off') {
      this.logLevel = LogLevel.NONE;
    } else if (!envLogLevel || envLogLevel === 'info') {
      // Default to INFO level when undefined or explicitly set to 'info'
      this.logLevel = LogLevel.INFO;
    } else {
      switch (envLogLevel) {
        case 'error':
          this.logLevel = LogLevel.ERROR;
          break;
        case 'warn':
          this.logLevel = LogLevel.WARN;
          break;
        case 'debug':
          this.logLevel = LogLevel.DEBUG;
          break;
        default:
          // If invalid value, default to INFO
          this.logLevel = LogLevel.INFO;
      }
    }
  }

  private static formatLogEntry(level: string, message: string, meta?: Record<string, any>, error?: Error): string {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (meta) {
      logEntry.meta = meta;
    }

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return JSON.stringify(logEntry);
  }

  private log(level: LogLevel, levelName: string, message: string, meta?: Record<string, any>, error?: Error): void {
    if (level <= this.logLevel) {
      const formattedLog = Logger.formatLogEntry(levelName, message, meta, error);
      console.log(formattedLog);
    }
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    this.log(LogLevel.ERROR, 'ERROR', message, meta, error);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, 'WARN', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, 'INFO', message, meta);
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, meta);
  }

  // API request logging helper
  apiRequest(method: string, url: string, statusCode?: number, duration?: number, meta?: Record<string, any>): void {
    if (statusCode && statusCode >= 400) {
      // ERROR level: Log failures with details
      this.error(`API Request Failed: ${method} ${url} - ${statusCode}`, undefined, {
        method,
        url,
        statusCode,
        duration,
        ...meta,
      });
    } else {
      // INFO level: Just log basic success info
      this.info(`API Request: ${method} ${url} - ${statusCode} (${duration}ms)`);
    }
  }

  // Authentication event logging
  authEvent(event: string, user?: string, success: boolean = true, meta?: Record<string, any>): void {
    if (success) {
      // INFO level: Just log basic auth success
      this.info(`Auth: ${event}${user ? ` [${user}]` : ''}`);
    } else {
      // WARN level: Log auth failures with some context
      this.warn(`Auth Failed: ${event}`, {
        event,
        user,
        ...meta,
      });
    }
  }
}

export const logger = new Logger();
export default logger;