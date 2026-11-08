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

/** Largest JSON body a route reads unless it passes a smaller limit. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/**
 * Reads a body stream as text, up to maxBytes. Returns null as soon as the limit is passed and cancels the rest of
 * the stream, so an oversized body is never held in memory in full.
 */
export const readTextUpTo = async (stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> => {
   if (!stream) { return ''; }
   const reader = stream.getReader();
   const chunks: Uint8Array[] = [];
   let total = 0;
   for (;;) {
      const { done, value } = await reader.read();
      if (done) { break; }
      total += value.byteLength;
      if (total > maxBytes) {
         await reader.cancel().catch(() => undefined);
         return null;
      }
      chunks.push(value);
   }
   return new TextDecoder().decode(Buffer.concat(chunks));
};

const bodies = new WeakMap<Request, Promise<unknown>>();

/**
 * The parsed JSON body, or undefined when there is none. A body that is not valid JSON answers 400, and one larger
 * than maxBytes answers 413. The size is checked before reading when Content-Length is sent, and again while
 * streaming. Safe to call more than once.
 */
export const readJson = (req: Request, maxBytes: number = DEFAULT_MAX_BODY_BYTES): Promise<unknown> => {
   let body = bodies.get(req);
   if (!body) {
      const tooLarge = () => new ApiError(413, 'PAYLOAD_TOO_LARGE', `Request body is larger than ${maxBytes} bytes`);
      body = (async () => {
         const declaredLength = Number(req.headers.get('content-length'));
         if (Number.isFinite(declaredLength) && declaredLength > maxBytes) { throw tooLarge(); }
         const text = await readTextUpTo(req.body, maxBytes);
         if (text === null) { throw tooLarge(); }
         if (!text.trim()) { return undefined; }
         try {
            return JSON.parse(text);
         } catch (_error) {
            throw new ApiError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
         }
      })();
      bodies.set(req, body);
   }
   return body;
};
