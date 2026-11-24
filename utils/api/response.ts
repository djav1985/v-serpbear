/**
 * The JSON envelope of every app REST response (protocol and binary routes are outside it).
 *
 *   success:  { data: <route DTO>, error: null, requestId }
 *   failure:  { data: null, error: { code, message, details? }, requestId }
 */

export interface ErrorObject {
   code: string;
   message: string;
   details?: unknown;
}

export interface SuccessEnvelope<T = unknown> {
   data: T;
   error: null;
   requestId?: string;
}

export interface FailureEnvelope {
   data: null;
   error: ErrorObject;
   requestId?: string;
}

export type ApiEnvelope<T = unknown> = SuccessEnvelope<T> | FailureEnvelope;

/** Constructs a success envelope. */
export function successResponse<T>(data: T, requestId?: string): SuccessEnvelope<T> {
   const envelope: SuccessEnvelope<T> = { data, error: null };
   if (requestId) { envelope.requestId = requestId; }
   return envelope;
}

/** Constructs a failure envelope. */
export function errorResponse(
   code: string,
   message: string,
   requestId?: string,
   details?: unknown,
): FailureEnvelope {
   const envelope: FailureEnvelope = { data: null, error: { code, message } };
   if (details !== undefined) { envelope.error.details = details; }
   if (requestId) { envelope.requestId = requestId; }
   return envelope;
}
