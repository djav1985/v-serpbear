import {
   buildKeywordAddPayloads,
   getDomainLocations,
   getDomainTags,
   getAddKeywordsMessage,
   getLocationUpdateMessage,
   planLocationUpdate,
   splitAlreadyTracked,
   scraperAllowsCity,
} from '../../utils/keywordMeta';

const makeKeyword = (overrides: Partial<KeywordType>): KeywordType => ({
   ID: 1,
   keyword: 'alpha',
   device: 'desktop',
   country: 'US',
   domain: 'example.com',
   location: '',
   tags: [],
   lastUpdated: '2024-01-01T00:00:00.000Z',
   added: '2024-01-01T00:00:00.000Z',
   position: 1,
   volume: 0,
   sticky: false,
   history: {},
   lastResult: [],
   url: '',
   updating: false,
   lastUpdateError: false,
   ...overrides,
} as KeywordType);

describe('getDomainTags', () => {
   it('returns an empty list when there are no keywords', () => {
      expect(getDomainTags([])).toEqual([]);
   });

   it('returns unique, non-blank tags across keywords', () => {
      const keywords = [
         makeKeyword({ ID: 1, tags: ['seo', ' ', ''] }),
         makeKeyword({ ID: 2, tags: ['seo', 'content'] }),
      ];
      expect(getDomainTags(keywords)).toEqual(['seo', 'content']);
   });
});

describe('getDomainLocations', () => {
   it('returns an empty list when no keyword has a location', () => {
      expect(getDomainLocations([makeKeyword({ location: '' })])).toEqual([]);
   });

   it('returns unique, sorted, non-empty locations', () => {
      const keywords = [
         makeKeyword({ ID: 1, location: 'US' }),
         makeKeyword({ ID: 2, location: 'Austin,TX,US' }),
         makeKeyword({ ID: 3, location: 'US' }),
         makeKeyword({ ID: 4, location: '  ' }),
      ];
      expect(getDomainLocations(keywords)).toEqual(['Austin,TX,US', 'US']);
   });

   it('lists a location once when it is spelled with a country name and with its code', () => {
      const keywords = [
         makeKeyword({ ID: 1, location: 'Austin,TX,US' }),
         makeKeyword({ ID: 2, location: 'Austin,TX,United States' }),
      ];
      expect(getDomainLocations(keywords)).toEqual(['Austin,TX,US']);
   });

   it('handles keywords with a missing location', () => {
      const keywords = [makeKeyword({ location: undefined })];
      expect(getDomainLocations(keywords)).toEqual([]);
   });
});

describe('buildKeywordAddPayloads', () => {
   const items = [
      { keyword: 'alpha', country: 'US' },
      { keyword: 'beta', country: 'DE' },
   ];

   it('creates one payload per item per device with the chosen tags and location', () => {
      const payloads = buildKeywordAddPayloads({
         items,
         domain: 'example.com',
         devices: ['desktop', 'mobile'],
         tags: ['seo', 'content'],
         location: 'Austin,TX,US',
      });

      expect(payloads).toHaveLength(4);
      expect(payloads[0]).toEqual({
         keyword: 'alpha',
         device: 'desktop',
         country: 'US',
         domain: 'example.com',
         tags: 'seo, content',
         location: 'Austin,TX,US',
      });
      expect(payloads.map((p) => `${p.keyword}:${p.device}`)).toEqual([
         'alpha:desktop', 'alpha:mobile', 'beta:desktop', 'beta:mobile',
      ]);
   });

   it('falls back to each keyword country when no location is chosen', () => {
      const payloads = buildKeywordAddPayloads({
         items,
         domain: 'example.com',
         devices: ['desktop'],
         tags: [],
         location: '',
      });

      expect(payloads.map((p) => p.location)).toEqual(['US', 'DE']);
      expect(payloads.every((p) => p.tags === '')).toBe(true);
   });

   it('uses the chosen location country as the keyword country so the market matches', () => {
      const payloads = buildKeywordAddPayloads({
         items: [{ keyword: 'alpha', country: 'US' }],
         domain: 'example.com',
         devices: ['desktop'],
         tags: [],
         location: 'London,England,GB',
      });

      expect(payloads).toEqual([
         expect.objectContaining({ keyword: 'alpha', country: 'GB', location: 'London,England,GB' }),
      ]);
   });

   it('returns no payloads when there are no devices or items', () => {
      expect(buildKeywordAddPayloads({ items: [], domain: 'a.com', devices: ['desktop'], tags: [], location: '' })).toEqual([]);
      expect(buildKeywordAddPayloads({ items, domain: 'a.com', devices: [], tags: [], location: '' })).toEqual([]);
   });
});

describe('scraperAllowsCity', () => {
   it('returns false when settings are missing', () => {
      expect(scraperAllowsCity(undefined)).toBe(false);
   });

   it('reads allowsCity from the selected scraper', () => {
      const settings = {
         scraper_type: 'serpapi',
         available_scapers: [
            { label: 'Scrape', value: 'scrapingant', allowsCity: false },
            { label: 'SerpAPI', value: 'serpapi', allowsCity: true },
         ],
      } as unknown as SettingsType;
      expect(scraperAllowsCity(settings)).toBe(true);
   });
});

describe('planLocationUpdate', () => {
   const row = (ID: number, keyword: string, country = 'US', device = 'desktop', domain = 'example.com') => ({ ID, keyword, country, device, domain });

   it('accepts every keyword when nothing else is tracked in the new location', () => {
      expect(planLocationUpdate([row(1, 'alpha'), row(2, 'beta')], [], 'GB')).toEqual({ acceptedIDs: [1, 2], skipped: [] });
   });

   it('skips a keyword whose new location is already tracked by another row', () => {
      const result = planLocationUpdate([row(1, 'alpha'), row(2, 'beta')], [row(9, 'alpha', 'GB')], 'GB');
      expect(result).toEqual({ acceptedIDs: [2], skipped: ['alpha'] });
   });

   it('treats the same keyword on another device or domain as not a duplicate', () => {
      const others = [row(9, 'alpha', 'GB', 'mobile'), row(10, 'alpha', 'GB', 'desktop', 'other.com')];
      expect(planLocationUpdate([row(1, 'alpha')], others, 'GB')).toEqual({ acceptedIDs: [1], skipped: [] });
   });

   it('keeps only the first of two selected keywords that would become the same tracked keyword', () => {
      const result = planLocationUpdate([row(1, 'alpha'), row(2, 'alpha')], [], 'GB');
      expect(result).toEqual({ acceptedIDs: [1], skipped: ['alpha'] });
   });

   it('never skips a keyword that keeps its own country when only the location text changes', () => {
      const result = planLocationUpdate([row(1, 'alpha'), row(2, 'alpha')], [], '');
      expect(result).toEqual({ acceptedIDs: [1, 2], skipped: [] });
   });

   it('returns nothing to update when there are no selected keywords', () => {
      expect(planLocationUpdate([], [row(9, 'alpha')], 'GB')).toEqual({ acceptedIDs: [], skipped: [] });
   });
});

describe('getLocationUpdateMessage', () => {
   it('reports a plain update with the right plural', () => {
      expect(getLocationUpdateMessage(1)).toBe('Updated 1 keyword.');
      expect(getLocationUpdateMessage(3)).toBe('Updated 3 keywords.');
   });

   it('reports skipped keywords alongside the updated count', () => {
      expect(getLocationUpdateMessage(2, ['alpha'])).toBe('Updated 2 keywords. Skipped 1 already tracked in that location: alpha.');
   });

   it('says nothing changed when every keyword was skipped', () => {
      expect(getLocationUpdateMessage(0, ['alpha', 'beta'])).toBe('No keywords changed. 2 already tracked in that location: alpha, beta.');
   });
});

describe('splitAlreadyTracked', () => {
   const payload = (keyword: string, device: 'desktop' | 'mobile', country = 'US') => ({
      keyword, device, country, domain: 'example.com', tags: '', location: country,
   });

   it('keeps untracked rows and reports tracked keyword and device pairs', () => {
      const lookup = { 'alpha:US:desktop': true };
      const result = splitAlreadyTracked([payload('alpha', 'desktop'), payload('alpha', 'mobile'), payload('beta', 'desktop')], lookup);
      expect(result.payloads.map((p) => `${p.keyword}:${p.device}`)).toEqual(['alpha:mobile', 'beta:desktop']);
      expect(result.skipped).toEqual(['alpha (desktop)']);
   });

   it('does not treat the same keyword in another country as tracked', () => {
      const result = splitAlreadyTracked([payload('alpha', 'desktop', 'GB')], { 'alpha:US:desktop': true });
      expect(result.payloads).toHaveLength(1);
      expect(result.skipped).toEqual([]);
   });

   it('returns nothing to add when everything is tracked', () => {
      const result = splitAlreadyTracked([payload('alpha', 'desktop')], { 'alpha:US:desktop': true });
      expect(result).toEqual({ payloads: [], skipped: ['alpha (desktop)'] });
   });
});

describe('getAddKeywordsMessage', () => {
   it('keeps the original wording when nothing was skipped', () => {
      expect(getAddKeywordsMessage(3)).toBe('Keywords Added Successfully!');
   });

   it('reports added and skipped keywords', () => {
      expect(getAddKeywordsMessage(2, ['alpha (desktop)'])).toBe('Added 2 keywords. Skipped 1 already tracked: alpha (desktop).');
      expect(getAddKeywordsMessage(1, ['alpha (desktop)'])).toBe('Added 1 keyword. Skipped 1 already tracked: alpha (desktop).');
   });

   it('says nothing was added when every row was skipped', () => {
      expect(getAddKeywordsMessage(0, ['alpha (desktop)'])).toBe('No keywords added. 1 already tracked: alpha (desktop).');
   });
});
