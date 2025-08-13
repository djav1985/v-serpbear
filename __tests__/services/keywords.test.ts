import { fetchKeywords } from '../../services/keywords';

describe('fetchKeywords', () => {
  it('returns empty keywords array when domain is falsy', async () => {
    // @ts-ignore - router not used when domain is falsy
    const result = await fetchKeywords({}, '');
    expect(result).toEqual({ keywords: [] });
  });
});
