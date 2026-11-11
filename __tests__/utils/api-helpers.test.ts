/** @jest-environment node */

import isRequestSecure from '../../utils/api/isRequestSecure';
import { parseStrictBooleanQueryParam } from '../../utils/api/queryBoolean';
import { errorResponse } from '../../utils/api/response';

const createRequestWithHeaders = (
  headers: Record<string, string | string[]>,
  encrypted?: boolean,
): Request => new Request(`${encrypted ? 'https' : 'http'}://app.test/api/test`, {
  headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])),
});

describe('isRequestSecure', () => {
    const originalTrustProxy = process.env.TRUST_PROXY;
    // The forwarded-header cases run behind one trusted proxy; the fallback case clears TRUST_PROXY
    beforeEach(() => { process.env.TRUST_PROXY = '1'; });
    afterEach(() => {
      if (originalTrustProxy === undefined) { delete process.env.TRUST_PROXY; } else { process.env.TRUST_PROXY = originalTrustProxy; }
    });

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

    it('ignores forwarded protocol headers without TRUST_PROXY and uses only the request URL scheme', () => {
      delete process.env.TRUST_PROXY;
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https' }))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-protocol': 'https' }))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-ssl': 'on' }))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({ 'x-forwarded-proto': 'https' }, true))).toBe(true);
    });

    it('falls back to the request URL scheme and reports insecure when no indicator is present', () => {
      expect(isRequestSecure(createRequestWithHeaders({}, true))).toBe(true);
      expect(isRequestSecure(createRequestWithHeaders({}, false))).toBe(false);
      expect(isRequestSecure(createRequestWithHeaders({}))).toBe(false);
    });
  });

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


    it('returns { ok: false } for unknown, empty or whitespace-only values', () => {
      for (const value of ['maybe', 'enabled', 'null', '2', '', '   ']) {
        expect(parseStrictBooleanQueryParam(value)).toMatchObject({ ok: false });
      }
    });


  });

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
