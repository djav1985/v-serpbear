/**
 * The one browser client for the app's REST API.
 *
 * `callApi(endpoint, { query, body })` looks the method, path and schemas up in the shared contract
 * (utils/api/contracts), so a call cannot pair a path with the wrong method, request or response type. It:
 * - checks the request against the endpoint's schema before sending it
 * - sends query parameters for reads and a JSON body for writes
 * - decodes the response envelope { data, error, requestId }, rejecting anything that is not one
 * - checks `data` against the endpoint's response schema and returns it
 * - turns every failure into an ApiError with the server's message, code and request id
 */

import { ZodError } from 'zod';
import { endpoints, type EndpointData, type EndpointInput, type EndpointKey } from '../api/contracts';
import { getClientOrigin } from './origin';

export class ApiError extends Error {
   readonly statusCode: number;
   readonly code: string;
   readonly requestId?: string;

   constructor(message: string, statusCode: number, code: string, requestId?: string) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.code = code;
      this.requestId = requestId;
   }
}

/**
 * Toast text for a failed request. A 409 conflict carries a message written for the user (for example "try again
 * once the refresh has finished"), so it is shown as is. Anything else gets the generic fallback.
 */
export function conflictMessage(error: unknown, fallback: string): string {
   return error instanceof ApiError && error.statusCode === 409 && error.message.trim() ? error.message : fallback;
}

const genericMessage = (status: number) => `Server error (${status}): Please try again later`;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Query parameters as a string: arrays are comma-separated, booleans are "true"/"false", undefined is left out. */
export function buildQueryString(query: Record<string, unknown> | undefined): string {
   const params = new URLSearchParams();
   Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === null) { return; }
      params.set(key, Array.isArray(value) ? value.join(',') : String(value));
   });
   const text = params.toString();
   return text ? `?${text}` : '';
}

type CallArgs<K extends EndpointKey> = Record<string, never> extends EndpointInput<K> ? [input?: EndpointInput<K>] : [input: EndpointInput<K>];

/** Calls an endpoint of the shared contract and returns its `data`. */
export async function callApi<K extends EndpointKey>(key: K, ...args: CallArgs<K>): Promise<EndpointData<K>> {
   const endpoint = endpoints[key] as (typeof endpoints)[EndpointKey];
   const input = (args[0] ?? {}) as { query?: Record<string, unknown>, body?: unknown };

   let queryText = '';
   let bodyText: string | undefined;
   try {
      if ('query' in endpoint && endpoint.query) { queryText = buildQueryString(endpoint.query.parse(input.query ?? {}) as Record<string, unknown>); }
      if ('body' in endpoint && endpoint.body) { bodyText = JSON.stringify(endpoint.body.parse(input.body ?? {})); }
   } catch (error) {
      const message = error instanceof ZodError ? error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ') : 'Invalid request';
      throw new ApiError(`Invalid request for ${key}: ${message}`, 0, 'INVALID_REQUEST');
   }

   const res = await fetch(`${getClientOrigin()}${endpoint.path}${queryText}`, {
      method: endpoint.method,
      headers: { Accept: 'application/json', ...(bodyText !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: bodyText,
   });
   const headerRequestId = res.headers.get('X-Request-Id') ?? undefined;

   let payload: unknown = null;
   if ((res.headers.get('content-type') ?? '').includes('application/json')) {
      try { payload = await res.json(); } catch (_error) { payload = null; }
   } else {
      try { await res.text(); } catch (_error) { /* ignore */ }
   }
   const envelope = isObject(payload) && 'data' in payload && 'error' in payload ? payload : null;
   const requestId = (envelope && typeof envelope.requestId === 'string' ? envelope.requestId : undefined) ?? headerRequestId;

   if (!res.ok) {
      const failure = envelope && isObject(envelope.error) ? envelope.error : null;
      throw new ApiError(
         failure && typeof failure.message === 'string' ? failure.message : genericMessage(res.status),
         res.status,
         failure && typeof failure.code === 'string' ? failure.code : 'UNKNOWN',
         requestId,
      );
   }
   if (!envelope || envelope.error !== null) {
      throw new ApiError('The server sent a response in an unexpected format.', res.status, 'INVALID_ENVELOPE', requestId);
   }
   const parsed = endpoint.response.safeParse(envelope.data);
   if (!parsed.success) {
      throw new ApiError(`The server's answer to ${key} did not match the expected shape.`, res.status, 'INVALID_RESPONSE', requestId);
   }
   return parsed.data as EndpointData<K>;
}
