import parseKeywords from '../../utils/parseKeywords';

describe('parseKeywords', () => {
  it('parses JSON fields correctly', () => {
    const input: any = [{
      history: '["h1"]',
      tags: '["t1","t2"]',
      lastResult: '{"r":1}',
      lastUpdateError: 'false',
      position: 1,
      lastUpdated: new Date().toJSON(),
    }];
    const [parsed] = parseKeywords(input);
    expect(parsed.history).toEqual(['h1']);
    expect(parsed.tags).toEqual(['t1', 't2']);
    expect(parsed.lastResult).toEqual({ r: 1 });
    expect(parsed.lastUpdateError).toBe(false);
  });

  it('parses lastUpdateError json when present', () => {
    const input: any = [{
      history: '[]',
      tags: '[]',
      lastResult: '{}',
      lastUpdateError: '{"msg":"err"}',
      position: 1,
      lastUpdated: new Date().toJSON(),
    }];
    const [parsed] = parseKeywords(input);
    expect(parsed.lastUpdateError).toEqual({ msg: 'err' });
  });

  it('handles invalid json gracefully', () => {
    const input: any = [{
      history: 'invalid',
      tags: 'oops',
      lastResult: 'bad',
      lastUpdateError: 'notjson',
      position: 1,
      lastUpdated: new Date().toJSON(),
    }];
    const [parsed] = parseKeywords(input);
    expect(parsed.history).toEqual({});
    expect(parsed.tags).toEqual([]);
    expect(parsed.lastResult).toEqual([]);
    expect(parsed.lastUpdateError).toBe(false);
  });
});
