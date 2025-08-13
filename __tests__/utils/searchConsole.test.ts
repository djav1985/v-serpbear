import { parseSearchConsoleItem, integrateKeywordSCData } from '../../utils/searchConsole';

jest.mock('../../utils/countries', () => ({
  getCountryCodeFromAlphaThree: jest.fn().mockReturnValue('US'),
}));

describe('searchConsole utils', () => {
  it('parses raw search console item', () => {
    const raw: any = {
      keys: ['test', 'DESKTOP', 'USA', 'https://example.com/page'],
      clicks: 1,
      impressions: 2,
      ctr: 0.5,
      position: 3,
    };
    const parsed = parseSearchConsoleItem(raw, 'example.com');
    expect(parsed).toEqual({
      keyword: 'test',
      uid: 'us:desktop:test',
      device: 'desktop',
      country: 'US',
      clicks: 1,
      impressions: 2,
      ctr: 50,
      position: 3,
      page: '/page',
    });
  });

  it('integrates keyword sc data', () => {
    const keyword: any = { keyword: 'test', country: 'US', device: 'desktop' };
    const scData: any = {
      threeDays: [{ uid: 'us:desktop:test', impressions: 3, clicks: 1, ctr: 0.1, position: 5 }],
      sevenDays: [],
      thirtyDays: [],
    };
    const result = integrateKeywordSCData(keyword, scData);
    expect(result.scData.impressions.threeDays).toBe(3);
    expect(result.scData.impressions.avgThreeDays).toBe(1);
    expect(result.scData.visits.threeDays).toBe(1);
    expect(result.scData.position.threeDays).toBe(5);
  });
});
