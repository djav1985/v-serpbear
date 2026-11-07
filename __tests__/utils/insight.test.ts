import { getCountryInsight, getKeywordsInsight, getPagesInsight, sortInsightItems } from '../../utils/insight';

describe('Insight Functions', () => {
  const mockSCData: SCDomainDataType = {
    threeDays: [
      {
        keyword: 'test keyword 1',
        uid: 'us:desktop:test_keyword_1',
        device: 'desktop',
        country: 'US',
        clicks: 10,
        impressions: 100,
        ctr: 10,
        position: 5,
        page: '/page1',
      },
      {
        keyword: 'test keyword 2',
        uid: 'ca:mobile:test_keyword_2',
        device: 'mobile',
        country: 'CA',
        clicks: 20,
        impressions: 200,
        ctr: 10,
        position: 3,
        page: '/page2',
      },
      {
        keyword: 'test keyword 1',
        uid: 'ca:desktop:test_keyword_1',
        device: 'desktop',
        country: 'CA',
        clicks: 5,
        impressions: 50,
        ctr: 10,
        position: 7,
        page: '/page1',
      },
    ],
    sevenDays: [],
    thirtyDays: [],
    lastFetched: new Date().toISOString(),
    lastFetchError: '',
    stats: [],
  };

  describe('getCountryInsight', () => {
    it('should return country insights with correct data', () => {
      const result = getCountryInsight(mockSCData, 'clicks', 'threeDays');

      expect(result).toHaveLength(2);

      // Check US data
      const usData = result.find((item) => item.country === 'US');
      expect(usData).toBeDefined();
      expect(usData?.clicks).toBe(10);
      expect(usData?.impressions).toBe(100);
      expect(usData?.keywords).toBe(1);

      // Check CA data
      const caData = result.find((item) => item.country === 'CA');
      expect(caData).toBeDefined();
      expect(caData?.clicks).toBe(25); // 20 + 5
      expect(caData?.impressions).toBe(250); // 200 + 50
      expect(caData?.keywords).toBe(2); // 'test keyword 2' + 'test keyword 1'
    });

    it('should handle empty data gracefully', () => {
      const emptyData: SCDomainDataType = {
        threeDays: [],
        sevenDays: [],
        thirtyDays: [],
        lastFetched: '',
        lastFetchError: '',
        stats: [],
      };

      expect(getCountryInsight(emptyData, 'clicks', 'threeDays')).toEqual([]);
      expect(getKeywordsInsight(emptyData, 'clicks', 'threeDays')).toEqual([]);
      expect(getPagesInsight(emptyData, 'clicks', 'threeDays')).toEqual([]);
    });

    it('should handle invalid data gracefully', () => {
      expect(getCountryInsight(null as any, 'clicks', 'threeDays')).toEqual([]);
      expect(getKeywordsInsight(null as any, 'clicks', 'threeDays')).toEqual([]);
      expect(getPagesInsight(null as any, 'clicks', 'threeDays')).toEqual([]);
    });
  });

  describe('getKeywordsInsight', () => {
    it('should return keyword insights with correct country data', () => {
      const result = getKeywordsInsight(mockSCData, 'clicks', 'threeDays');

      expect(result).toHaveLength(2);

      // Check 'test keyword 1' - should appear in 2 countries (US, CA)
      const keyword1Data = result.find((item) => item.keyword === 'test keyword 1');
      expect(keyword1Data).toBeDefined();
      expect(keyword1Data?.clicks).toBe(15); // 10 + 5
      expect(keyword1Data?.countries).toBe(2); // US + CA

      // Check 'test keyword 2' - should appear in 1 country (CA)
      const keyword2Data = result.find((item) => item.keyword === 'test keyword 2');
      expect(keyword2Data).toBeDefined();
      expect(keyword2Data?.clicks).toBe(20);
      expect(keyword2Data?.countries).toBe(1); // CA only
    });

  });

  describe('getPagesInsight', () => {
    it('should return page insights with correct data', () => {
      const result = getPagesInsight(mockSCData, 'clicks', 'threeDays');

      expect(result).toHaveLength(2);

      // Check /page1
      const page1Data = result.find((item) => item.page === '/page1');
      expect(page1Data).toBeDefined();
      expect(page1Data?.clicks).toBe(15); // 10 + 5
      expect(page1Data?.keywords).toBe(1); // 'test keyword 1' in two countries is one keyword
      expect(page1Data?.countries).toBe(2); // US + CA

      // Check /page2
      const page2Data = result.find((item) => item.page === '/page2');
      expect(page2Data).toBeDefined();
      expect(page2Data?.clicks).toBe(20);
      expect(page2Data?.keywords).toBe(1); // 1 occurrence of 'test keyword 2'
      expect(page2Data?.countries).toBe(1); // CA only
    });

  });

  describe('Data integrity and bug fixes', () => {
    it('should correctly populate countries array in keyword insights (bug fix verification)', () => {
      const result = getKeywordsInsight(mockSCData, 'clicks', 'threeDays');

      const keyword1Data = result.find((item) => item.keyword === 'test keyword 1');
      // Before the fix, this would be counting keywords instead of countries
      expect(keyword1Data?.countries).toBe(2); // Should be 2 countries: US, CA

      const keyword2Data = result.find((item) => item.keyword === 'test keyword 2');
      expect(keyword2Data?.countries).toBe(1); // Should be 1 country: CA
    });

    it('should average country metrics per row and keep underscore keywords distinct', () => {
      const data: SCDomainDataType = {
        threeDays: [
          { keyword: 'a b', uid: 'us:desktop:a_b', device: 'desktop', country: 'US', clicks: 1, impressions: 1, ctr: 10, position: 2, page: '/p' },
          { keyword: 'a b', uid: 'us:mobile:a_b', device: 'mobile', country: 'US', clicks: 1, impressions: 1, ctr: 20, position: 4, page: '/p' },
          { keyword: 'a_b', uid: 'us:desktop:a__b', device: 'desktop', country: 'US', clicks: 1, impressions: 1, ctr: 30, position: 6, page: '/p' },
        ],
        sevenDays: [],
        thirtyDays: [],
        lastFetched: '',
        lastFetchError: '',
        stats: [],
      };

      // 3 rows, 2 unique keywords: CTR is total clicks / total impressions, position is weighted by impressions
      const countryResult = getCountryInsight(data, 'clicks', 'threeDays');
      expect(countryResult[0].position).toBe(4);
      expect(countryResult[0].ctr).toBe(100);
      expect(countryResult[0].keywords).toBe(2);

      const keywordResult = getKeywordsInsight(data, 'clicks', 'threeDays');
      expect(keywordResult).toHaveLength(2);
      const spaced = keywordResult.find((item) => item.keyword === 'a b');
      const underscored = keywordResult.find((item) => item.keyword === 'a_b');
      expect(spaced?.clicks).toBe(2);
      expect(spaced?.position).toBe(3);
      expect(underscored?.clicks).toBe(1);
      expect(underscored?.position).toBe(6);

      // Large Search Console windows (25,000 distinct queries and pages) are aggregated in a single pass
      const largeRows = Array.from({ length: 25000 }, (_, i) => ({
        keyword: `kw ${i}`, uid: `us:desktop:${i}`, device: 'desktop', country: i % 2 ? 'US' : 'CA', clicks: 1, impressions: 2, ctr: 5, position: 3, page: `/p${i}`,
      }));
      const large: SCDomainDataType = { ...data, threeDays: largeRows as SCDomainDataType['threeDays'] };
      const startedAt = Date.now();
      expect(getKeywordsInsight(large, 'clicks', 'threeDays')).toHaveLength(25000);
      expect(getPagesInsight(large, 'clicks', 'threeDays')).toHaveLength(25000);
      expect(getCountryInsight(large, 'clicks', 'threeDays')).toHaveLength(2);
      expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('weights CTR and position by impressions instead of averaging rows', () => {
      const data: SCDomainDataType = {
        threeDays: [
          { keyword: 'kw', uid: 'us:desktop:kw', device: 'desktop', country: 'US', clicks: 1, impressions: 1000, ctr: 0.1, position: 10, page: '/p' },
          { keyword: 'kw', uid: 'ca:desktop:kw', device: 'desktop', country: 'CA', clicks: 1, impressions: 2, ctr: 50, position: 2, page: '/p' },
        ],
        sevenDays: [],
        thirtyDays: [],
        lastFetched: '',
        lastFetchError: '',
        stats: [],
      };

      const [keywordRow] = getKeywordsInsight(data, 'clicks', 'threeDays');
      // 2 clicks / 1002 impressions, not the mean of 0.1 and 50
      expect(keywordRow.ctr).toBe(0.2);
      // (10 x 1000 + 2 x 2) / 1002 = 9.99, not the mean of 10 and 2
      expect(keywordRow.position).toBe(10);
    });

    it('should handle null/undefined values in data', () => {
      const malformedData: SCDomainDataType = {
        threeDays: [
          {
            keyword: 'test keyword',
            uid: 'us:desktop:test_keyword',
            device: 'desktop',
            country: 'US',
            clicks: null as any,
            impressions: undefined as any,
            ctr: 10,
            position: 5,
            page: '/page1',
          },
        ],
        sevenDays: [],
        thirtyDays: [],
        lastFetched: '',
        lastFetchError: '',
        stats: [],
      };

      const keywordResult = getKeywordsInsight(malformedData, 'clicks', 'threeDays');
      expect(keywordResult).toHaveLength(1);
      expect(keywordResult[0].clicks).toBe(0); // Should default to 0
      expect(keywordResult[0].impressions).toBe(0); // Should default to 0

      const countryResult = getCountryInsight(malformedData, 'clicks', 'threeDays');
      expect(countryResult).toHaveLength(1);
      expect(countryResult[0].clicks).toBe(0); // Should default to 0
      expect(countryResult[0].impressions).toBe(0); // Should default to 0

      const pageResult = getPagesInsight(malformedData, 'clicks', 'threeDays');
      expect(pageResult).toHaveLength(1);
      expect(pageResult[0].clicks).toBe(0); // Should default to 0
      expect(pageResult[0].impressions).toBe(0); // Should default to 0
    });
  });

  describe('sortInsightItems', () => {
    it('sorts position values in ascending order placing undefined at the end', () => {
      const items: SCInsightItem[] = [
        { clicks: 0, impressions: 0, ctr: 0, position: 5 },
        { clicks: 0, impressions: 0, ctr: 0, position: 1 },
        { clicks: 0, impressions: 0, ctr: 0, position: undefined as unknown as number },
      ];

      const sorted = sortInsightItems([...items], 'position');

      expect(sorted[0].position).toBe(1);
      expect(sorted[1].position).toBe(5);
      expect(sorted[2].position).toBeUndefined();
    });
  });
});
