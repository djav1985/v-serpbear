/**
 * Centralized API client for SerpBear frontend services.
 *
 * Provides typed helpers for common request patterns that automatically:
 * - Construct URLs using the client origin
 * - Set standard headers (Content-Type, Accept)
 * - Execute fetch
 * - Parse JSON responses
 * - Decode the shared envelope format
 * - Convert errors to Error instances with human-readable messages
 * - Propagate X-Request-Id from response headers
 */

import { getClientOrigin } from './origin';
import type { NextRouter } from 'next/router';

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
 * Extracts an error message from a JSON error response body.
 * Handles both the structured failure envelope and legacy string-error shapes.
 */
function extractMessage(data: unknown, status: number): string {
   if (!data || typeof data !== 'object') {
      return `Server error (${status}): Please try again later`;
   }
   const err = (data as Record<string, unknown>).error;
   if (typeof err === 'string') { return err; }
   if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>).message;
      if (typeof msg === 'string') { return msg; }
   }
   return `Server error (${status}): Please try again later`;
}

/**
 * Extracts an error code from a structured failure envelope.
 */
function extractCode(data: unknown): string {
   if (!data || typeof data !== 'object') { return 'UNKNOWN'; }
   const err = (data as Record<string, unknown>).error;
   if (err && typeof err === 'object') {
      const code = (err as Record<string, unknown>).code;
      if (typeof code === 'string') { return code; }
   }
   return 'UNKNOWN';
}

/**
 * Core fetch wrapper that handles errors and returns parsed JSON.
 * Optionally redirects to /login on 401.
 */
export async function apiFetch<T = unknown>(
   path: string,
   init: RequestInit = {},
   router?: Pick<NextRouter, 'push'>,
): Promise<T> {
   const origin = getClientOrigin();
   const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers as Record<string, string> | undefined),
   });

   const res = await fetch(`${origin}${path}`, { ...init, headers });
   const requestId = res.headers.get('X-Request-Id') ?? undefined;

   if (res.status >= 400 && res.status < 600) {
      if (res.status === 401 && router) { router.push('/login'); }
      let data: unknown = null;
      try {
         const contentType = res.headers.get('content-type');
         if (contentType && contentType.includes('application/json')) {
            data = await res.json();
         } else {
            await res.text();
         }
      } catch (_) { /* ignore parse errors */ }
      const message = extractMessage(data, res.status);
      const code = extractCode(data);
      throw new ApiError(message, res.status, code, requestId);
   }

   return res.json() as Promise<T>;
}

/** GET request helper */
export function apiGet<T = unknown>(
   path: string,
   router?: Pick<NextRouter, 'push'>,
): Promise<T> {
   return apiFetch<T>(path, { method: 'GET' }, router);
}

/** POST request helper */
export function apiPost<T = unknown>(
   path: string,
   body: unknown,
   router?: Pick<NextRouter, 'push'>,
): Promise<T> {
   return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }, router);
}

/** PUT request helper */
export function apiPut<T = unknown>(
   path: string,
   body: unknown,
   router?: Pick<NextRouter, 'push'>,
): Promise<T> {
   return apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }, router);
}

/** DELETE request helper */
export function apiDelete<T = unknown>(
   path: string,
   router?: Pick<NextRouter, 'push'>,
): Promise<T> {
   return apiFetch<T>(path, { method: 'DELETE' }, router);
}
