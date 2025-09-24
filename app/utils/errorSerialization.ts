const collectMessages = (input: unknown, seen: Set<unknown> = new Set()): string[] => {
   if (input === null || input === undefined) { return []; }
   if (typeof input === 'string') { return input ? [input] : []; }
   if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
      return [String(input)];
   }

   if (input instanceof Error) {
      const nested = collectMessages((input as Error & { cause?: unknown }).cause, seen);
      return [input.message, ...nested].filter(Boolean);
   }

   if (typeof input === 'object') {
      if (seen.has(input)) { return []; }
      seen.add(input);

      if (Array.isArray(input)) {
         return input.flatMap((value) => collectMessages(value, seen));
      }

      const record = input as Record<string, unknown>;
      const prioritizedKeys = [
         'message',
         'error',
         'detail',
         'error_message',
         'description',
         'statusText',
         'body',
         'reason',
         'request_info',
         'cause',
         'response',
      ];
      const parts: string[] = [];

      for (const key of prioritizedKeys) {
         if (key in record && key !== 'status') {
            parts.push(...collectMessages(record[key], seen));
         }
      }

      for (const [key, value] of Object.entries(record)) {
         if (key === 'status' || prioritizedKeys.includes(key)) { continue; }
         if (value && typeof value === 'object') {
            parts.push(...collectMessages(value, seen));
         }
      }

      return parts;
   }

   return [String(input)];
};

export const serializeError = (error: unknown): string => {
   if (!error) { return 'Unknown error'; }

   if (typeof error === 'string') { return error; }

   if (error instanceof Error) {
      const messages = collectMessages(error);
      const cleaned = Array.from(new Set(messages
         .map((part) => part.trim())
         .filter((part) => part && part !== 'null' && part !== 'undefined')));
      return cleaned.length > 0 ? cleaned.join(' ').trim() : 'Unknown error';
   }

   if (typeof error === 'object') {
      const record = error as Record<string, unknown>;
      const status = record.status;
      const statusPrefix = (typeof status === 'number' || (typeof status === 'string' && status))
         ? `[${status}]`
         : '';
      const messages = collectMessages(error);
      const cleaned = Array.from(new Set(messages
         .map((part) => part.trim())
         .filter((part) => part && part !== 'null' && part !== 'undefined')));
      const messageBody = cleaned.join(' ').trim();

      if (statusPrefix || messageBody) {
         return [statusPrefix, messageBody].filter(Boolean).join(' ').trim();
      }

      try {
         const serialized = JSON.stringify(error);
         if (serialized && serialized !== '{}') {
            return serialized;
         }
      } catch (jsonError) {
         // Ignore JSON serialization errors and fall back to string conversion below
      }

      const fallback = typeof (error as { toString?: () => string }).toString === 'function'
         ? (error as { toString: () => string }).toString()
         : '';
      if (fallback && fallback !== '[object Object]') {
         return fallback;
      }

      return 'Unserializable error object';
   }

   return String(error);
};

export default serializeError;
