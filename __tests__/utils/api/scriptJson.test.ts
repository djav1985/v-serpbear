export {};

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
