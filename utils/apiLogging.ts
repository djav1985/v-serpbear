import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { logger } from './logger';

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
    logSuccess?: boolean;
  } = {}
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const { 
      logBody = false,
      skipAuth: _skipAuth = false,
      name,
      logSuccess = logger.isSuccessLoggingEnabled(),
    } = options;

    // Add request ID to the request object for downstream use
    (req as any).requestId = requestId;

    // Always log body in DEBUG mode or when explicitly requested
    const shouldLogBody = logBody || process.env.LOG_LEVEL === 'DEBUG' || process.env.LOG_LEVEL === 'VERBOSE';

    const requestMeta = {
      requestId,
      method: req.method,
      url: req.url,
      query: req.query,
      ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      ...(shouldLogBody && req.body ? { body: req.body } : {}),
    };

    // Always log the request start
    logger.info(`API Request Started${name ? ` [${name}]` : ''}`, requestMeta);

    // Capture the original res.json and res.status functions to log responses
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    let statusCode = 200;
    let responseBody: any;

    res.status = function(code: number) {
      statusCode = code;
      return originalStatus(code);
    };

    res.json = function(body: any) {
      responseBody = body;
      return originalJson(body);
    };

    try {
      // Execute the actual handler
      await handler(req, res);

      const duration = Date.now() - startTime;
      
      const responseMeta = {
        requestId,
        method: req.method,
        url: req.url,
        statusCode,
        duration,
        ...(shouldLogBody && responseBody ? { responseBody } : {}),
      };

      // Log based on status code
      if (statusCode >= 500) {
        logger.error(`API Request Failed${name ? ` [${name}]` : ''}`, undefined, responseMeta);
      } else if (statusCode >= 400) {
        logger.warn(`API Request Error${name ? ` [${name}]` : ''}`, responseMeta);
      } else if (logSuccess) {
        logger.info(`API Request Completed${name ? ` [${name}]` : ''}`, responseMeta);
      } else {
        // Always log at DEBUG level even if logSuccess is false
        logger.debug(`API Request Completed${name ? ` [${name}]` : ''}`, responseMeta);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`API Request Exception${name ? ` [${name}]` : ''}`, error instanceof Error ? error : new Error(String(error)), {
        requestId,
        method: req.method,
        url: req.url,
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
