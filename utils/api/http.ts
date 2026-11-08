import { errorResponse } from './response';

/** What every route handler receives besides the request. */
export type ApiContext = { requestId: string };

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
