/**
 * A stand-in for utils/apiLogging in route tests. The real wrapper adds request ids, logging, the API-key lockout and a
 * database check; route tests want only the route itself. This keeps what a route depends on: the response helpers,
 * `requireAuth`, and `createRoute` with the same auth and 405 rules (auth runs through the test's mocked verifyUser).
 * The wrapper itself is covered in logging.test.ts.
 *
 *   jest.mock('../utils/apiLogging', () => require('./__helpers__/apiLoggingMock').apiLoggingMock());
 */
export const apiLoggingMock = () => {
  const http = jest.requireActual('../../utils/api/http');
  const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const ctx = { requestId: 'test-request-id' };

  // Required now, not per request, so a test that loads the route in an isolated registry shares that registry's verifyUser mock
  const verifyModule = require('../../utils/verifyUser');
  const verify = (req: Request): string => (verifyModule.default ?? verifyModule)(req);

  const requireAuth = (req: Request, context: unknown) => {
    const authorized = verify(req);
    return authorized === 'authorized' ? null : http.fail(401, 'UNAUTHORIZED', authorized, context);
  };

  const createRoute = (def: Record<string, any>) => {
    const entry = (method: string) => async (req: Request) => {
      try {
        if (def.auth !== false) {
          const denied = requireAuth(req, ctx);
          if (denied) { return denied; }
        }
        const handler = def[method];
        if (!handler) {
          const allowed = HTTP_METHODS.filter((m) => def[m]).join(', ');
          return http.fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', ctx, undefined, { Allow: allowed });
        }
        return await handler(req, ctx);
      } catch (error: any) {
        if (error instanceof http.ApiError) { return http.fail(error.status, error.code, error.message, ctx); }
        return http.fail(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', ctx);
      }
    };
    return { GET: entry('GET'), POST: entry('POST'), PUT: entry('PUT'), PATCH: entry('PATCH'), DELETE: entry('DELETE') };
  };

  return { __esModule: true, ...http, requireAuth, createRoute, HTTP_METHODS };
};
