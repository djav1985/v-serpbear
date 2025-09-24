/**
 * Enhanced logging utility for SerpBear
 * Provides structured logging with different levels and Docker-friendly output
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4,
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
  private logSuccessEvents: boolean;

  constructor() {
    // Set log level from environment or default to INFO
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLogLevel) {
      case 'ERROR':
        this.logLevel = LogLevel.ERROR;
        break;
      case 'WARN':
        this.logLevel = LogLevel.WARN;
        break;
      case 'DEBUG':
        this.logLevel = LogLevel.DEBUG;
        break;
      case 'VERBOSE':
        this.logLevel = LogLevel.VERBOSE;
        break;
      default:
        this.logLevel = LogLevel.INFO;
    }
    // Set success event logging from environment or default to true
    const envSuccessLogging = process.env.LOG_SUCCESS_EVENTS;
    this.logSuccessEvents = !['false', '0', 'off'].includes(envSuccessLogging ?? '');
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

  verbose(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.VERBOSE, 'VERBOSE', message, meta);
  }

  isSuccessLoggingEnabled(): boolean {
    return this.logSuccessEvents;
  }

  // API request logging helper
  apiRequest(method: string, url: string, statusCode?: number, duration?: number, meta?: Record<string, any>): void {
    const logMeta = {
      method,
      url,
      statusCode,
      duration,
      ...meta,
    };

    if (statusCode && statusCode >= 400) {
      this.error(`API Request Failed: ${method} ${url}`, undefined, logMeta);
    } else if (this.logSuccessEvents) {
      this.info(`API Request: ${method} ${url}`, logMeta);
    }
  }

  // Authentication event logging
  authEvent(event: string, user?: string, success: boolean = true, meta?: Record<string, any>): void {
    const logMeta = {
      event,
      user,
      success,
      ...meta,
    };
    if (success && this.logSuccessEvents) {
      this.info(`Auth Event: ${event}`, logMeta);
    } else if (!success) {
      this.warn(`Auth Event Failed: ${event}`, logMeta);
    }
  }
}

export const logger = new Logger();
export default logger;