import { logger } from './logger';

type SafeJsonParseOptions = {
   context?: string;
   /** Parse failures are logged by default; pass false to stay quiet. */
   logError?: boolean;
};

/**
 * Safely parse a JSON string with a fallback value.
 * @param value Raw JSON string (or any value) to parse.
 * @param fallback Value to return when parsing fails.
 * @param options Context for the log line, and logError: false to skip it.
 * @returns Parsed JSON value or the fallback.
 */
export const safeJsonParse = <T>(
   value: unknown,
   fallback: T,
   options: SafeJsonParseOptions = {},
): T => {
   if (value === null || value === undefined) {
      return fallback;
   }

   if (typeof value !== 'string') {
      return fallback;
   }

   const trimmed = value.trim();
   if (!trimmed) {
      return fallback;
   }

   try {
      return JSON.parse(trimmed) as T;
   } catch (error) {
      if (options.logError !== false) {
         logger.error(`[PARSE] Failed to parse ${options.context || 'JSON'}`, error instanceof Error ? error : new Error(String(error)));
      }
      return fallback;
   }
};
