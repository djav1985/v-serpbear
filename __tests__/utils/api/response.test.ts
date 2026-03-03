import { successResponse, errorResponse } from '../../../utils/api/response';
import type { SuccessEnvelope, FailureEnvelope } from '../../../utils/api/response';

describe('successResponse', () => {
   it('wraps data in the success envelope', () => {
      const result = successResponse({ domains: [] });
      expect(result).toEqual({ data: { domains: [] } });
   });

   it('includes requestId when provided', () => {
      const result = successResponse({ ok: true }, 'req-123');
      expect(result).toEqual({ data: { ok: true }, requestId: 'req-123' });
   });

   it('omits requestId when not provided', () => {
      const result = successResponse({ ok: true });
      expect(result.requestId).toBeUndefined();
   });

   it('preserves TypeScript generic type parameter', () => {
      const result: SuccessEnvelope<{ count: number }> = successResponse({ count: 42 });
      expect(result.data.count).toBe(42);
   });
});

describe('errorResponse', () => {
   it('constructs a failure envelope with code and message', () => {
      const result = errorResponse('NOT_FOUND', 'Resource not found');
      expect(result).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
   });

   it('includes requestId when provided', () => {
      const result = errorResponse('BAD_REQUEST', 'Invalid input', 'req-abc');
      expect(result.requestId).toBe('req-abc');
   });

   it('includes details when provided', () => {
      const result = errorResponse('BAD_REQUEST', 'Validation failed', undefined, ['field is required']);
      expect(result.error.details).toEqual(['field is required']);
   });

   it('omits requestId when undefined', () => {
      const result = errorResponse('SERVER_ERROR', 'Boom');
      expect(result.requestId).toBeUndefined();
   });

   it('omits details when undefined', () => {
      const result = errorResponse('SERVER_ERROR', 'Boom');
      expect(result.error.details).toBeUndefined();
   });

   it('satisfies the FailureEnvelope type', () => {
      const result: FailureEnvelope = errorResponse('CONFLICT', 'Already exists', 'rid');
      expect(result.error.code).toBe('CONFLICT');
      expect(result.error.message).toBe('Already exists');
   });
});
