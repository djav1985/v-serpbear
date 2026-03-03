import { parseStrictBooleanQueryParam } from '../../../pages/api/domains';

describe('parseStrictBooleanQueryParam', () => {
   describe('undefined (absent) param', () => {
      it('returns null for undefined (param not present)', () => {
         expect(parseStrictBooleanQueryParam(undefined)).toBeNull();
      });
   });

   describe('truthy values', () => {
      it.each(['true', 'TRUE', 'True', '1', 'on', 'ON', 'yes', 'YES', 'Yes'])(
         'returns { ok: true, value: true } for "%s"',
         (value) => {
            const result = parseStrictBooleanQueryParam(value);
            expect(result).toEqual({ ok: true, value: true });
         },
      );
   });

   describe('falsy values', () => {
      it.each(['false', 'FALSE', 'False', '0', 'off', 'OFF', 'no', 'NO', 'No'])(
         'returns { ok: true, value: false } for "%s"',
         (value) => {
            const result = parseStrictBooleanQueryParam(value);
            expect(result).toEqual({ ok: true, value: false });
         },
      );
   });

   describe('whitespace trimming', () => {
      it('trims surrounding whitespace before matching', () => {
         expect(parseStrictBooleanQueryParam('  true  ')).toEqual({ ok: true, value: true });
         expect(parseStrictBooleanQueryParam('  false  ')).toEqual({ ok: true, value: false });
      });
   });

   describe('unknown values (should be rejected)', () => {
      it.each(['maybe', 'enabled', 'disabled', 'active', 'null', 'undefined', '2', 'truthy'])(
         'returns { ok: false } for unknown value "%s"',
         (value) => {
            const result = parseStrictBooleanQueryParam(value);
            expect(result).toMatchObject({ ok: false });
         },
      );
   });

   describe('empty value (should be rejected)', () => {
      it('returns { ok: false } for empty string', () => {
         const result = parseStrictBooleanQueryParam('');
         expect(result).toMatchObject({ ok: false });
      });

      it('returns { ok: false } for whitespace-only string', () => {
         const result = parseStrictBooleanQueryParam('   ');
         expect(result).toMatchObject({ ok: false });
      });
   });

   describe('array inputs', () => {
      it('uses the last array element', () => {
         expect(parseStrictBooleanQueryParam(['false', 'true'])).toEqual({ ok: true, value: true });
         expect(parseStrictBooleanQueryParam(['true', 'false'])).toEqual({ ok: true, value: false });
      });

      it('returns { ok: false } for array with unknown last element', () => {
         const result = parseStrictBooleanQueryParam(['true', 'maybe']);
         expect(result).toMatchObject({ ok: false });
      });

      it('returns { ok: false } for empty array', () => {
         const result = parseStrictBooleanQueryParam([]);
         expect(result).toMatchObject({ ok: false });
      });
   });
});
