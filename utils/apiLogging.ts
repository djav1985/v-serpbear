import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { logger } from './logger';
import { ensureDatabase } from '../database/init';

/**
 * API Logging Middleware - wraps API handlers with request/response logging
 * @param handler - The API handler function to wrap
 * @param options - Optional configuration for logging behavior
 */
export function withApiLogging(
  handler: NextApiHandler,
  options: {
    logBody?: boolean;
    skipAuth?: boolean;
    name?: string;
  } = {}
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { 
      logBody = false,
      skipAuth: _skipAuth = false,
      name,
    } = options;

    // Add request ID to the request object for downstream use
    (req as ExtendedRequest).requestId = requestId;

    // Log body only in DEBUG mode or when explicitly requested
    const shouldLogBody = logBody || process.env.LOG_LEVEL?.toLowerCase() === 'debug';

    // INFO level: Just log the request method and URL
    logger.info(`${req.method} ${req.url}${name ? ` [${name}]` : ''}`);

    // DEBUG level: Log full request details
    if (shouldLogBody) {
      logger.debug(`API Request Details${name ? ` [${name}]` : ''}`, {
        requestId,
        method: req.method,
        url: req.url,
        query: req.query,
        ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        body: req.body,
      });
    }

    // Capture the original res.json and res.status functions to log responses
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    const originalWriteHead = res.writeHead?.bind(res);
    let statusCode = res.statusCode ?? 200;
    let responseBody: any;

    res.status = function(code: number) {
      statusCode = code;
      return originalStatus(code);
    };

    res.json = function(body: any) {
      responseBody = body;
      return originalJson(body);
    };

    if (originalWriteHead) {
      res.writeHead = function(code: number, ...args: any[]) {
        statusCode = code;
        return originalWriteHead(code, ...args);
      };
    }

    try {
      // Ensure database is initialized before executing any API handler
      // This is a fallback for cases where instrumentation hook doesn't run
      await ensureDatabase();
      
      // Execute the actual handler
      await handler(req, res);
      statusCode = res.statusCode ?? statusCode;

      const duration = Date.now() - startTime;
      
      // Log based on status code
      if (statusCode >= 500) {
        // ERROR level: Log errors with details
        logger.error(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - ${statusCode}`, undefined, {
          requestId,
          statusCode,
          duration,
          ...(shouldLogBody && responseBody ? { responseBody } : {}),
        });
      } else if (statusCode >= 400) {
        // WARN level: Log client errors with moderate detail
        logger.warn(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - ${statusCode}`, {
          requestId,
          statusCode,
          duration,
          ...(shouldLogBody && responseBody ? { responseBody } : {}),
        });
      } else {
        // INFO level: Just log success with duration
        logger.info(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - ${statusCode} (${duration}ms)`);
        
        // DEBUG level: Log full response details
        if (shouldLogBody && responseBody) {
          logger.debug(`API Response Details${name ? ` [${name}]` : ''}`, {
            requestId,
            statusCode,
            duration,
            responseBody,
          });
        }
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // ERROR level: Log exception with full details
      logger.error(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - Exception`, error instanceof Error ? error : new Error(String(error)), {
        requestId,
        duration,
      });

      // Send error response if not already sent
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Internal server error',
          requestId,
        });
      }
    }
  };
}


export default withApiLogging;
