/**
 * Shared API response contract types and helpers.
 *
 * Success envelope:  { data: T, requestId?: string }
 * Failure envelope:  { error: { code: string, message: string, details?: unknown }, requestId?: string }
 */

export interface SuccessEnvelope<T> {
   data: T;
   requestId?: string;
}

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
 * Wraps a success payload in the standard success envelope.
 */
export function successResponse<T>(data: T, requestId?: string): SuccessEnvelope<T> {
   const envelope: SuccessEnvelope<T> = { data };
   if (requestId) { envelope.requestId = requestId; }
   return envelope;
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
