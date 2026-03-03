import type { NextRouter } from 'next/router';

/**
 * Extracts an error message from a failed HTTP Response.
 * Attempts JSON parsing first; falls back to a generic status-code message.
 */
export async function extractErrorMessage(res: Response): Promise<string> {
   try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
         const data = await res.json();
         return data?.error ?? `Server error (${res.status}): Please try again later`;
      }
      await res.text();
      return `Server error (${res.status}): Please try again later`;
   } catch (_parseError) {
      return `Server error (${res.status}): Please try again later`;
   }
}

/**
 * Throws if the response indicates an error (status 400–599).
 * Optionally redirects to /login on 401.
 */
export async function throwOnError(
   res: Response,
   router?: Pick<NextRouter, 'push'>,
): Promise<void> {
   if (res.status < 400 || res.status >= 600) { return; }
   if (res.status === 401 && router) { router.push('/login'); }
   const message = await extractErrorMessage(res);
   throw new Error(message);
}
