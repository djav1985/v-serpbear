/**
 * Consolidated behavior suite for API utility helpers.
 *
 * Replaces the three individual micro-test files:
 *   - isRequestSecure.test.ts
 *   - parseBooleanQueryParam.test.ts
 *   - response.test.ts
 *
 * Each module keeps its own `describe` block for readability.
 */

import type { NextApiRequest } from 'next';
import isRequestSecure from '../../../utils/api/isRequestSecure';
import { parseStrictBooleanQueryParam } from '../../../pages/api/domains';
import { errorResponse } from '../../../utils/api/response';
import type { FailureEnvelope } from '../../../utils/api/response';

// ---------------------------------------------------------------------------
// isRequestSecure
// ---------------------------------------------------------------------------

const createRequestWithHeaders = (
  headers: Record<string, string | string[]>,
  encrypted?: boolean,
): NextApiRequest => {
  const socket = encrypted !== undefined ? { encrypted } : undefined;
  return { headers, socket } as unknown as NextApiRequest;
};

describe('isRequestSecure', () => {
  it('returns true when x-forwarded-proto is exactly "https"', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https' }))).toBe(true);
  });

  it('returns false when x-forwarded-proto is exactly "http"', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'http' }))).toBe(false);
  });

  it('returns true when x-forwarded-proto contains https in comma-delimited list', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https,http' }))).toBe(true);
  });

  it('returns true when x-forwarded-proto has https as second value in comma-delimited list', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'http,https' }))).toBe(true);
  });

  it('returns false when x-forwarded-proto is comma-delimited but contains no https', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'http,http' }))).toBe(false);
  });

  it('handles comma-delimited values with spaces', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https, http' }))).toBe(true);
  });

  it('returns true when x-forwarded-proto is an array containing https', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': ['https', 'http'] }))).toBe(true);
  });

  it('returns false when x-forwarded-proto is an array without https', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': ['http', 'http'] }))).toBe(false);
  });

  it('returns true when x-forwarded-protocol is https', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-protocol': 'https' }))).toBe(true);
  });

  it('returns true when x-forwarded-ssl is on', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'on' }))).toBe(true);
  });

  it('returns true when socket is encrypted', () => {
    expect(isRequestSecure(createRequestWithHeaders({}, true))).toBe(true);
  });

  it('returns false when socket is not encrypted', () => {
    expect(isRequestSecure(createRequestWithHeaders({}, false))).toBe(false);
  });

  it('returns false when no secure indicators are present', () => {
    expect(isRequestSecure(createRequestWithHeaders({}))).toBe(false);
  });

  it('is case-insensitive for header values', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'HTTPS' }))).toBe(true);
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'HTTPS,HTTP' }))).toBe(true);
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'ON' }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseStrictBooleanQueryParam
// ---------------------------------------------------------------------------

describe('parseStrictBooleanQueryParam', () => {
  it('returns null for undefined (param not present)', () => {
    expect(parseStrictBooleanQueryParam(undefined)).toBeNull();
  });

  it.each(['true', 'TRUE', 'True', '1', 'on', 'ON', 'yes', 'YES', 'Yes'])(
    'returns { ok: true, value: true } for "%s"',
    (value) => {
      expect(parseStrictBooleanQueryParam(value)).toEqual({ ok: true, value: true });
    },
  );

  it.each(['false', 'FALSE', 'False', '0', 'off', 'OFF', 'no', 'NO', 'No'])(
    'returns { ok: true, value: false } for "%s"',
    (value) => {
      expect(parseStrictBooleanQueryParam(value)).toEqual({ ok: true, value: false });
    },
  );

  it('trims surrounding whitespace before matching', () => {
    expect(parseStrictBooleanQueryParam('  true  ')).toEqual({ ok: true, value: true });
    expect(parseStrictBooleanQueryParam('  false  ')).toEqual({ ok: true, value: false });
  });

  it.each(['maybe', 'enabled', 'disabled', 'active', 'null', 'undefined', '2', 'truthy'])(
    'returns { ok: false } for unknown value "%s"',
    (value) => {
      expect(parseStrictBooleanQueryParam(value)).toMatchObject({ ok: false });
    },
  );

  it('returns { ok: false } for empty string', () => {
    expect(parseStrictBooleanQueryParam('')).toMatchObject({ ok: false });
  });

  it('returns { ok: false } for whitespace-only string', () => {
    expect(parseStrictBooleanQueryParam('   ')).toMatchObject({ ok: false });
  });

  it('uses the last array element', () => {
    expect(parseStrictBooleanQueryParam(['false', 'true'])).toEqual({ ok: true, value: true });
    expect(parseStrictBooleanQueryParam(['true', 'false'])).toEqual({ ok: true, value: false });
  });

  it('returns { ok: false } for array with unknown last element', () => {
    expect(parseStrictBooleanQueryParam(['true', 'maybe'])).toMatchObject({ ok: false });
  });

  it('returns { ok: false } for empty array', () => {
    expect(parseStrictBooleanQueryParam([])).toMatchObject({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// errorResponse
// ---------------------------------------------------------------------------

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
    expect(errorResponse('SERVER_ERROR', 'Boom').requestId).toBeUndefined();
  });

  it('omits details when undefined', () => {
    expect(errorResponse('SERVER_ERROR', 'Boom').error.details).toBeUndefined();
  });

  it('satisfies the FailureEnvelope type', () => {
    const result: FailureEnvelope = errorResponse('CONFLICT', 'Already exists', 'rid');
    expect(result.error.code).toBe('CONFLICT');
    expect(result.error.message).toBe('Already exists');
  });
});
