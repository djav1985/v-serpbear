import { formattedNum } from '../../../utils/client/helpers';
import { aggregateSCKeywords } from '../../../app/(dashboard)/domain/console/[slug]/_components/sc-state';
import { serializeForScript } from '../../../utils/api/scriptJson';

describe('serializeForScript', () => {
    it('never emits a raw "</script>" that would end an inline script early', () => {
      const output = serializeForScript({ message: '</script><script>alert(1)</script>' });

      expect(output).not.toContain('</script>');
      expect(output).not.toContain('<');
      expect(output).not.toContain('>');
    });

    it('round-trips through JSON.parse back to the original value', () => {
      const separators = `${String.fromCharCode(0x2028)} ${String.fromCharCode(0x2029)}`;
      const value = {
        message: `a < b && c > d </script> ${separators} "quoted"`,
        status: 'error',
        nested: { list: ['<img src=x onerror=alert(1)>'] },
      };

      expect(JSON.parse(serializeForScript(value))).toEqual(value);
    });

    it('serializes plain values the same way JSON.stringify does', () => {
      expect(serializeForScript({ ok: true, count: 2 })).toBe('{"ok":true,"count":2}');
      expect(serializeForScript('/settings?ads=integrated')).toBe('"/settings?ads=integrated"');
    });
  });

describe('formattedNum and Search Console aggregation', () => {
    it('groups thousands without dropping digits and keeps small values at 3 significant digits', () => {
      expect(formattedNum(12345)).toBe('12,345');
      expect(formattedNum(1234567)).toBe('1,234,567');
      expect(formattedNum(999)).toBe('999');
      expect(formattedNum(1.2345)).toBe('1.23');
    });

    it('weights position by impressions, computes CTR from totals, and guards zero impressions', () => {
      const row = (date: string, clicks: number, impressions: number, position: number, keyword = 'kw') => ({
        uid: `u-${date}`, keyword, device: 'desktop', country: 'USA', page: '/',
        clicks, impressions, ctr: 0, position, date,
      }) as unknown as SearchAnalyticsItem;

      const [grouped, empty] = aggregateSCKeywords([
        row('d1', 10, 100, 1),
        row('d2', 0, 900, 10),
        row('d1', 0, 0, 2, 'none'),
        row('d2', 0, 0, 4, 'none'),
      ]);

      expect(grouped.clicks).toBe(10);
      expect(grouped.impressions).toBe(1000);
      expect(grouped.ctr).toBe(1); // 10 / 1000 = 1%, not the mean of per-row CTRs
      expect(grouped.position).toBe(9); // (1*100 + 10*900) / 1000 = 9.1
      expect(empty.ctr).toBe(0);
      expect(empty.position).toBe(3); // plain average when there are no impressions
    });
  });
