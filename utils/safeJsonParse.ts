import { logger } from './logger';

type SafeJsonParseOptions = {
   context?: string;
   logError?: boolean;
};

/**
 * Safely parse a JSON string with a fallback value.
 * @param value Raw JSON string (or any value) to parse.
 * @param fallback Value to return when parsing fails.
 * @param options Context for logging and whether to log failures.
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
      if (options.logError) {
         logger.warn(`Failed to parse ${options.context || 'JSON'}`, {
            error: error instanceof Error ? error.message : String(error),
         });
      }
      return fallback;
   }
};
