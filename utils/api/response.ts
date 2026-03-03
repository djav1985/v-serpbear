/**
 * Shared API response contract types and helpers.
 *
 * Failure envelope:  { error: { code: string, message: string, details?: unknown }, requestId?: string }
 *
 * Note: success responses return resource data directly (e.g. `{ domains: [...] }`)
 * rather than a `{ data: T }` wrapper, to preserve backward compatibility.
 */

export interface ErrorObject {
   code: string;
   message: string;
   details?: unknown;
}

export interface FailureEnvelope {
   error: ErrorObject;
   requestId?: string;
}

/**
 * Constructs a standard failure envelope.
 */
export function errorResponse(
   code: string,
   message: string,
   requestId?: string,
   details?: unknown,
): FailureEnvelope {
   const envelope: FailureEnvelope = { error: { code, message } };
   if (details !== undefined) { envelope.error.details = details; }
   if (requestId) { envelope.requestId = requestId; }
   return envelope;
}
