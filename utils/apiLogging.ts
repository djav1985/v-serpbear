import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { logger } from './logger';
import { ensureDatabase } from '../database/init';
import { errorResponse } from './api/response';
import { redactSecrets, redactUrl } from './logRedaction';
import { getClientIp } from './api/clientIp';
import { isLoginLocked } from './loginThrottle';
import { getApiKeyAttemptKeys } from './apiKeyThrottle';
import { hasValidSessionCookie, isBearerAuthorization } from './verifyUser';

export { redactSecrets, redactUrl };

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
    logger.info(`${req.method} ${redactUrl(req.url)}${name ? ` [${name}]` : ''}`);

    // DEBUG level: Log full request details
    if (shouldLogBody) {
      logger.debug(`API Request Details${name ? ` [${name}]` : ''}`, {
        requestId,
        method: req.method,
        url: redactUrl(req.url),
        query: redactSecrets(req.query, ['code', 'state']),
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        body: redactSecrets(req.body),
      });
    }

    // A client address that sent too many wrong API keys is refused before any handler or key check runs.
    // Only Bearer attempts count, and a request with a valid login cookie is never refused for it.
    if (isBearerAuthorization(req.headers?.authorization) && isLoginLocked(getApiKeyAttemptKeys(req)) && !hasValidSessionCookie(req, res)) {
      res.setHeader('Retry-After', '900');
      logger.warn(`${req.method} ${redactUrl(req.url)}${name ? ` [${name}]` : ''} - 429 (API key locked)`);
      return res.status(429).json(
        errorResponse('TOO_MANY_ATTEMPTS', 'Too many failed API key attempts. Try again in 15 minutes.', requestId),
      );
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
        logger.error(`${req.method} ${redactUrl(req.url)}${name ? ` [${name}]` : ''} - ${statusCode}`, undefined, {
          requestId,
          statusCode,
          duration,
        });
      } else if (statusCode >= 400) {
        // WARN level: Log client errors with moderate detail
        logger.warn(`${req.method} ${redactUrl(req.url)}${name ? ` [${name}]` : ''} - ${statusCode}`, {
          requestId,
          statusCode,
          duration,
        });
      } else {
        // INFO level: Just log success with duration
        logger.info(`${req.method} ${redactUrl(req.url)}${name ? ` [${name}]` : ''} - ${statusCode} (${duration}ms)`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // ERROR level: Log exception with full details
      logger.error(`${req.method} ${redactUrl(req.url)}${name ? ` [${name}]` : ''} - Exception`, error instanceof Error ? error : new Error(String(error)), {
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
