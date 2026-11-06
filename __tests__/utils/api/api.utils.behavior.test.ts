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
import normalizeOrigin from '../../../utils/normalizeOrigin';

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
  it('detects https in x-forwarded-proto (exact, comma-delimited, array, case-insensitive)', () => {
    const cases: Array<[string | string[], boolean]> = [
      ['https', true],
      ['http', false],
      ['https,http', true],
      ['http,https', true],
      ['http,http', false],
      ['https, http', true],
      [['https', 'http'], true],
      [['http', 'http'], false],
      ['HTTPS', true],
      ['HTTPS,HTTP', true],
    ];
    for (const [value, expected] of cases) {
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': value }))).toBe(expected);
    }
  });

  it('honours x-forwarded-protocol and x-forwarded-ssl proxy headers', () => {
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-protocol': 'https' }))).toBe(true);
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'on' }))).toBe(true);
    expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'ON' }))).toBe(true);
  });

  it('falls back to socket encryption and reports insecure when no indicator is present', () => {
    expect(isRequestSecure(createRequestWithHeaders({}, true))).toBe(true);
    expect(isRequestSecure(createRequestWithHeaders({}, false))).toBe(false);
    expect(isRequestSecure(createRequestWithHeaders({}))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseStrictBooleanQueryParam
// ---------------------------------------------------------------------------

describe('parseStrictBooleanQueryParam', () => {
  it('returns null for undefined (param not present)', () => {
    expect(parseStrictBooleanQueryParam(undefined)).toBeNull();
  });

  it('maps accepted true and false spellings to { ok: true, value }', () => {
    const cases: Array<[string, boolean]> = [
      ['true', true], ['TRUE', true], ['1', true], ['on', true], ['yes', true],
      ['false', false], ['FALSE', false], ['0', false], ['off', false], ['no', false],
    ];
    for (const [value, expected] of cases) {
      expect(parseStrictBooleanQueryParam(value)).toEqual({ ok: true, value: expected });
    }
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseStrictBooleanQueryParam('  true  ')).toEqual({ ok: true, value: true });
    expect(parseStrictBooleanQueryParam('  false  ')).toEqual({ ok: true, value: false });
  });

  it('returns { ok: false } for unknown, empty or whitespace-only values', () => {
    for (const value of ['maybe', 'enabled', 'null', '2', '', '   ']) {
      expect(parseStrictBooleanQueryParam(value)).toMatchObject({ ok: false });
    }
  });

  it('uses the last array element and rejects an unknown last element', () => {
    expect(parseStrictBooleanQueryParam(['false', 'true'])).toEqual({ ok: true, value: true });
    expect(parseStrictBooleanQueryParam(['true', 'false'])).toEqual({ ok: true, value: false });
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

  it('includes requestId and details when provided', () => {
    const withRequestId = errorResponse('BAD_REQUEST', 'Invalid input', 'req-abc');
    expect(withRequestId.requestId).toBe('req-abc');

    const withDetails = errorResponse('BAD_REQUEST', 'Validation failed', undefined, ['field is required']);
    expect(withDetails.error.details).toEqual(['field is required']);
  });

  it('omits requestId and details when undefined', () => {
    const result = errorResponse('SERVER_ERROR', 'Boom');
    expect(result.requestId).toBeUndefined();
    expect(result.error.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeOrigin
// ---------------------------------------------------------------------------

describe('normalizeOrigin', () => {
  it('removes one or more trailing slashes, keeping any path', () => {
    const cases: Array<[string, string]> = [
      ['https://example.com/', 'https://example.com'],
      ['https://example.com///', 'https://example.com'],
      ['https://example.com/path/', 'https://example.com/path'],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeOrigin(input)).toBe(expected);
    }
  });

  it('leaves a URL with no trailing slash and an empty string unchanged, and returns empty for only slashes', () => {
    expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
    expect(normalizeOrigin('')).toBe('');
    expect(normalizeOrigin('///')).toBe('');
  });
});
