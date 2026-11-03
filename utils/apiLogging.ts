import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { logger } from './logger';
import { ensureDatabase } from '../database/init';
import { errorResponse } from './api/response';

const SECRET_KEY_PATTERN = /pass|secret|token|key|api|smtp_password|private/i;

/**
 * Returns a copy of a request body with secret-looking values replaced, so debug logs never contain
 * passwords, API keys or private keys.
 */
export const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SECRET_KEY_PATTERN.test(key) && typeof nested === 'string' && nested.length > 0 ? '[REDACTED]' : redactSecrets(nested),
      ]),
    );
  }
  return value;
};

/**
 * API Logging Middleware - wraps API handlers with request/response logging
 * @param handler - The API handler function to wrap
 * @param options - Optional configuration for logging behavior
 */
export function withApiLogging(
  handler: NextApiHandler,
  options: {
    name?: string;
  } = {}
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { name } = options;

    // Add request ID to the request object for downstream use
    (req as ExtendedRequest).requestId = requestId;

    // Set X-Request-Id header on the response so clients can correlate requests
    res.setHeader('X-Request-Id', requestId);

    // Log body in DEBUG mode
    const shouldLogBody = process.env.LOG_LEVEL?.toLowerCase() === 'debug';

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
        body: redactSecrets(req.body),
      });
    }

    try {
      // Ensure database is initialized before executing any API handler
      // This is a fallback for cases where instrumentation hook doesn't run
      // (e.g., Docker, standalone mode, some production scenarios)
      // Performance note: After first initialization, this is just a fast boolean check
      await ensureDatabase();
      
      // Execute the actual handler
      await handler(req, res);
      
      // Read status code directly after handler completes
      const statusCode = res.statusCode ?? 200;

      const duration = Date.now() - startTime;
      
      // Log based on status code
      if (statusCode >= 500) {
        // ERROR level: Log errors with details
        logger.error(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - ${statusCode}`, undefined, {
          requestId,
          statusCode,
          duration,
        });
      } else if (statusCode >= 400) {
        // WARN level: Log client errors with moderate detail
        logger.warn(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - ${statusCode}`, {
          requestId,
          statusCode,
          duration,
        });
      } else {
        // INFO level: Just log success with duration
        logger.info(`${req.method} ${req.url}${name ? ` [${name}]` : ''} - ${statusCode} (${duration}ms)`);
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
        res.status(500).json(
          errorResponse('INTERNAL_SERVER_ERROR', 'Internal server error', requestId),
        );
      }
    }
  };
}


export default withApiLogging;
