/** Cookie helpers for route handlers that work on a standard Request / Response. */

/** Reads one cookie from the Cookie header of a request. Returns undefined when it is missing. */
export const getCookie = (req: Request, name: string): string | undefined => {
   const header = req.headers.get('cookie');
   if (!header) { return undefined; }
   for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index < 0) { continue; }
      if (part.slice(0, index).trim() !== name) { continue; }
      const raw = part.slice(index + 1).trim().replace(/^"(.*)"$/, '$1');
      try {
         return decodeURIComponent(raw);
      } catch (_error) {
         return raw;
      }
   }
   return undefined;
};

type CookieOptions = {
   httpOnly?: boolean;
   secure?: boolean;
   sameSite?: 'lax' | 'strict' | 'none';
   path?: string;
   maxAge?: number; // milliseconds, like the `cookies` package it replaces
   expires?: Date;
};

/** Builds a Set-Cookie header value. */
export const serializeCookie = (name: string, value: string, options: CookieOptions = {}): string => {
   const parts = [`${name}=${encodeURIComponent(value)}`];
   parts.push(`Path=${options.path ?? '/'}`);
   if (options.maxAge !== undefined) { parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`); }
   if (options.expires) { parts.push(`Expires=${options.expires.toUTCString()}`); }
   if (options.httpOnly) { parts.push('HttpOnly'); }
   if (options.sameSite) { parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`); }
   if (options.secure) { parts.push('Secure'); }
   return parts.join('; ');
};
