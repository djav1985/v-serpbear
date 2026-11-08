import { logger } from './logger';
import { ensureDatabase } from '../database/init';
import { errorResponse } from './api/response';
import { redactSecrets, redactUrl } from './logRedaction';
import { getClientIp } from './api/clientIp';
import { isLoginLocked } from './loginThrottle';
import { getApiKeyAttemptKeys } from './apiKeyThrottle';
import verifyUser, { hasValidSessionCookie, isBearerAuthorization } from './verifyUser';

/** What every route handler receives besides the request. */
export type ApiContext = { requestId: string };

export type ApiHandler = (req: Request, ctx: ApiContext) => Promise<Response> | Response;

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = typeof HTTP_METHODS[number];

type RouteDefinition = Partial<Record<HttpMethod, ApiHandler>> & {
   /** Short label used in log lines. */
   name: string;
   /** Requires a login cookie or an allowed API key before any method runs. Defaults to true. */
   auth?: boolean;
};

/** A JSON response. */
export const json = (body: unknown, status = 200, headers?: HeadersInit): Response => (
   Response.json(body, { status, headers })
);

/** A failure response using the shared error envelope. */
export const fail = (status: number, code: string, message: string, ctx: ApiContext, details?: unknown, headers?: HeadersInit): Response => (
   Response.json(errorResponse(code, message, ctx.requestId, details), { status, headers })
);

/** Thrown inside a handler to answer with a specific client error. */
export class ApiError extends Error {
   constructor(public status: number, public code: string, message: string) {
      super(message);
   }
}

/** For a route that is public for some methods: the 401 response when the request is not signed in, otherwise null. */
export const requireAuth = (req: Request, ctx: ApiContext): Response | null => {
   const authorized = verifyUser(req);
   return authorized === 'authorized' ? null : fail(401, 'UNAUTHORIZED', authorized, ctx);
};

/** The query string as a plain object. Repeated keys become arrays, like the Pages Router `req.query`. */
export const getQuery = (req: Request): Record<string, string | string[]> => {
   const query: Record<string, string | string[]> = {};
   new URL(req.url).searchParams.forEach((value, key) => {
      const existing = query[key];
      if (existing === undefined) { query[key] = value; }
      else if (Array.isArray(existing)) { existing.push(value); }
      else { query[key] = [existing, value]; }
   });
   return query;
};

/** The first value of a query parameter, or undefined. */
export const getParam = (req: Request, name: string): string | undefined => new URL(req.url).searchParams.get(name) ?? undefined;

const bodies = new WeakMap<Request, Promise<unknown>>();

/** The parsed JSON body, or undefined when there is none. A body that is not valid JSON answers 400. Safe to call more than once. */
export const readJson = (req: Request): Promise<unknown> => {
   let body = bodies.get(req);
   if (!body) {
      body = req.text().then((text) => {
         if (!text.trim()) { return undefined; }
         try {
            return JSON.parse(text);
         } catch (_error) {
            throw new ApiError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
         }
      });
      bodies.set(req, body);
   }
   return body;
};

const withRequestId = (response: Response, requestId: string): Response => {
   try {
      response.headers.set('X-Request-Id', requestId);
      return response;
   } catch (_error) {
      // Some responses (redirects, fetched responses) have immutable headers
      const copy = new Response(response.body, response);
      copy.headers.set('X-Request-Id', requestId);
      return copy;
   }
};

const run = async (handler: ApiHandler | undefined, def: RouteDefinition, req: Request): Promise<Response> => {
   const startTime = Date.now();
   const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
   const ctx: ApiContext = { requestId };
   const label = `${req.method} ${redactUrl(req.url)}${def.name ? ` [${def.name}]` : ''}`;

   logger.debug(`[API] ${label}`);

   if (process.env.LOG_LEVEL?.toLowerCase() === 'debug') {
      let body: unknown;
      try { body = await req.clone().json(); } catch (_error) { body = undefined; }
      logger.debug(`[API] Request Details${def.name ? ` [${def.name}]` : ''}`, {
         requestId,
         method: req.method,
         url: redactUrl(req.url),
         query: redactSecrets(getQuery(req), ['code', 'state']),
         ip: getClientIp(req),
         userAgent: req.headers.get('user-agent'),
         contentType: req.headers.get('content-type'),
         body: redactSecrets(body),
      });
   }

   // A client address that sent too many wrong API keys is refused before any handler or key check runs.
   // Only Bearer attempts count, and a request with a valid login cookie is never refused for it.
   if (isBearerAuthorization(req.headers.get('authorization') ?? undefined) && isLoginLocked(getApiKeyAttemptKeys(req)) && !hasValidSessionCookie(req)) {
      logger.warn(`${label} - 429 (API key locked)`);
      return withRequestId(fail(429, 'TOO_MANY_ATTEMPTS', 'Too many failed API key attempts. Try again in 15 minutes.', ctx, undefined, { 'Retry-After': '900' }), requestId);
   }

   let response: Response;
   try {
      // Fallback for when the instrumentation hook did not run (Docker, standalone). After the first call this is a boolean check.
      await ensureDatabase();

      if (def.auth !== false) {
         const authorized = verifyUser(req);
         if (authorized !== 'authorized') {
            response = fail(401, 'UNAUTHORIZED', authorized, ctx);
            return withRequestId(response, requestId);
         }
      }

      if (!handler) {
         const allowed = HTTP_METHODS.filter((m) => def[m]).join(', ');
         response = fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', ctx, undefined, { Allow: allowed });
      } else {
         response = await handler(req, ctx);
      }
   } catch (error) {
      if (error instanceof ApiError) {
         response = fail(error.status, error.code, error.message, ctx);
      } else {
         logger.error(`${label} - Exception`, error instanceof Error ? error : new Error(String(error)), {
            requestId,
            duration: Date.now() - startTime,
         });
         response = fail(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', ctx);
      }
   }

   const statusCode = response.status;
   const duration = Date.now() - startTime;
   if (statusCode >= 500) {
      logger.error(`${label} - ${statusCode}`, undefined, { requestId, statusCode, duration });
   } else if (statusCode >= 400) {
      logger.debug(`[API] ${label} - ${statusCode}`, { requestId, statusCode, duration });
   } else {
      logger.debug(`[API] ${label} - ${statusCode} (${duration}ms)`);
   }
   return withRequestId(response, requestId);
};

/**
 * Builds the route exports (GET, POST, PUT, PATCH, DELETE) for an App Router `route.ts`:
 *   export const { GET, POST, PUT, PATCH, DELETE } = createRoute({ name: 'keyword', GET: getKeyword });
 * It adds request ids and logging, makes sure the database is ready, checks the login or API key (unless auth is false),
 * turns a thrown error into a 500, and answers any method the route does not define with a 405 in the shared error shape.
 */
export function createRoute(def: RouteDefinition) {
   const entry = (method: HttpMethod) => (req: Request) => run(def[method], def, req);
   return {
      GET: entry('GET'),
      POST: entry('POST'),
      PUT: entry('PUT'),
      PATCH: entry('PATCH'),
      DELETE: entry('DELETE'),
   };
}
