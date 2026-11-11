import crazyserp from '../../../scrapers/services/crazyserp';
import prismcrawl from '../../../scrapers/services/prismcrawl';
import {  } from '../../../utils/scraper';
import dataforseo from '../../../scrapers/services/dataforseo';
import serpbase from '../../../scrapers/services/serpbase';
import valueSerp from '../../../scrapers/services/valueserp';
import hasdata from '../../../scrapers/services/hasdata';
import serper from '../../../scrapers/services/serper';
import serpapi from '../../../scrapers/services/serpapi';
import serply from '../../../scrapers/services/serply';
import searchapi from '../../../scrapers/services/searchapi';
const buildKeyword = (overrides: Partial<KeywordType> = {}) =>
  ({ keyword: 'plumbers', country: 'US', device: 'desktop', location: '', domain: 'plumbers.example', ...overrides } as KeywordType);
jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('crazyserp', () => {
  describe('crazyserp scraper', () => {




    describe('serpExtractor', () => {
            const baseKeyword: KeywordType = {
               ID: 1,
               keyword: 'coffee',
               country: 'US',
               domain: 'example.com',
               device: 'desktop',
               lastUpdated: '',
               volume: 0,
               added: '',
               position: 0,
               sticky: false,
               history: {},
               lastResult: [],
               url: '',
               tags: [],
               updating: false,
               lastUpdateError: false,
               mapPackTop3: false,
               location: '',
            };

            describe('map pack from locations', () => {
               const locations = [
                  { title: 'CeJay Websites', website_url: 'https://cejaywebsites.com/', rating: 5 },
                  { title: 'Vontainment', website_url: 'https://vontainment.com/' },
                  { title: 'No Site' },
               ];

               it('reads the documented payload shape, where the scraper passes parsed_data as the result', () => {
                  const response = {
                     success: true,
                     parsed_data: {
                        has_map: true,
                        organic: [{ title: 'Vontainment', url: 'https://vontainment.com/', position: 1 }],
                        locations,
                     },
                  };

                  const extraction = crazyserp.serpExtractor!({
                     keyword: baseKeyword,
                     response,
                     result: response.parsed_data,
                     settings: { business_name: 'Vontainment' } as any,
                  } as any);

                  expect(extraction.organic).toHaveLength(1);
                  expect(extraction.mapPackTop3).toBe(true);
                  expect(extraction.localResults).toHaveLength(3);
               });

               it('gives the same map pack whether parsed_data arrives as an object or a JSON string', () => {
                  const parsedData = { organic: [{ title: 'Vontainment', url: 'https://vontainment.com/', position: 1 }], locations };
                  const run = (result: unknown) => crazyserp.serpExtractor!({
                     keyword: baseKeyword, response: {}, result, settings: { business_name: 'Vontainment' } as any,
                  } as any);

                  const fromObject = run(parsedData);
                  const fromString = run(JSON.stringify(parsedData));

                  expect(fromString.mapPackTop3).toBe(true);
                  expect(fromString).toEqual(fromObject);
               });

               it('is false when no top-3 business matches, or there are no locations', () => {
                  const noMatch = crazyserp.serpExtractor!({
                     keyword: baseKeyword, response: {}, result: { organic: [], locations }, settings: { business_name: 'Other Co' } as any,
                  } as any);
                  const none = crazyserp.serpExtractor!({
                     keyword: baseKeyword, response: {}, result: { organic: [] }, settings: { business_name: 'Vontainment' } as any,
                  } as any);

                  expect(noMatch.mapPackTop3).toBe(false);
                  expect(none.mapPackTop3).toBe(false);
                  expect(none.localResults).toEqual([]);
               });
            });

            it('extracts organic results from a JSON string or a pre-parsed array', () => {
               const results = [
                  { title: 'Result 1', url: 'https://example.com', position: 1 },
                  { title: 'Result 2', url: 'https://other.com', position: 2 },
               ];

               const fromString = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: {},
                  result: JSON.stringify({ organic: results }),
               });
               expect(fromString.organic).toHaveLength(2);
               expect(fromString.organic[0]).toEqual({ title: 'Result 1', url: 'https://example.com', position: 1 });
               expect(fromString.organic[1]).toEqual({ title: 'Result 2', url: 'https://other.com', position: 2 });

               const fromArray = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: {},
                  result: results,
               });
               expect(fromArray.organic).toHaveLength(2);
               expect(fromArray.organic[0].url).toBe('https://example.com');
            });

            it('falls back to response.organic, then response.parsed_data, when result is not provided', () => {
               const fromOrganic = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: { organic: [{ title: 'Fallback Result', url: 'https://fallback.com', position: 1 }] },
               });
               expect(fromOrganic.organic).toHaveLength(1);
               expect(fromOrganic.organic[0].url).toBe('https://fallback.com');

               const fromParsed = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: { parsed_data: [{ title: 'Parsed Result', url: 'https://parsed.com', position: 1 }] },
               });
               expect(fromParsed.organic).toHaveLength(1);
               expect(fromParsed.organic[0].url).toBe('https://parsed.com');
            });

            it('filters out items that are missing title or url', () => {
               const results = [
                  { title: 'Good Result', url: 'https://good.com', position: 1 },
                  { title: '', url: 'https://notitle.com', position: 2 },
                  { title: 'No URL', url: '', position: 3 },
               ];

               const extraction = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: {},
                  result: results,
               });

               expect(extraction.organic).toHaveLength(1);
               expect(extraction.organic[0].url).toBe('https://good.com');
            });

            it('throws on invalid JSON string response', () => {
               expect(() => {
                  crazyserp.serpExtractor!({
                     keyword: baseKeyword,
                     response: {},
                     result: 'not valid json',
                  });
               }).toThrow('Invalid JSON response for CrazySERP');
            });

            it('returns no organic results and no map pack when the response has no results or locations', () => {
               const empty = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: {},
                  result: [],
               });
               expect(empty.organic).toHaveLength(0);

               const noLocations = crazyserp.serpExtractor!({
                  keyword: baseKeyword,
                  response: {},
                  result: [{ title: 'R', url: 'https://r.com', position: 1 }],
               });
               expect(noLocations.mapPackTop3).toBe(false);
               expect(noLocations.localResults).toEqual([]);
            });
         });
  });
});

describe('prismcrawl', () => {




  const settings = { scraping_api: 'prism-test-key' } as SettingsType;

  describe('prismcrawl scraper', () => {
    afterEach(() => {
          jest.restoreAllMocks();
        });

    describe('serpExtractor', () => {
          // Mirrors the live payload: { success, data: { content: { results } } }
          const payloadWith = (results: unknown[]) => ({
            success: true,
            data: { format: 'json', content: { results } },
          });
          const extract = (response: unknown) =>
            prismcrawl.serpExtractor({
              keyword: buildKeyword(),
              response: response as any,
              result: (response as any)?.data,
              settings,
            } as any);

          it('maps organic results into title/url/position items using position.absolute', () => {
            const { organic } = extract(payloadWith([
              { type: 'organic', title: 'Plumber A', url: 'https://a.example', position: { absolute: 1 } },
              { type: 'organic', title: 'Plumber B', url: 'https://b.example', position: { absolute: 2 } },
            ]));
            expect(organic).toEqual([
              { title: 'Plumber A', url: 'https://a.example', position: 1 },
              { title: 'Plumber B', url: 'https://b.example', position: 2 },
            ]);
          });

          it('uses the result domain in place of a Google redirect link, and leaves the link when there is no domain', () => {
            const { organic } = extract(payloadWith([
              { type: 'organic', title: 'Insurance Inspections', url: 'https://www.google.com/goto?url=CAESfwHE', domain: 'tailoredinspection.com', position: { absolute: 5 } },
              { type: 'organic', title: 'Facebook thread', url: 'https://www.google.com/goto?url=CAEShQEB', domain: '', position: { absolute: 3 } },
              { type: 'organic', title: 'Plain', url: 'https://a.example/', domain: 'a.example', position: { absolute: 1 } },
            ]));

            expect(organic[0].url).toBe('https://tailoredinspection.com/');
            expect(organic[1].url).toBe('https://www.google.com/goto?url=CAEShQEB');
            expect(organic[2].url).toBe('https://a.example/');
          });

          it('ignores non-organic items such as local_results and ai_summary', () => {
            const { organic } = extract(payloadWith([
              { type: 'ai_summary', title: 'AI Overview' },
              { type: 'organic', title: 'Keep', url: 'https://k.example', position: { absolute: 1 } },
            ]));
            expect(organic).toEqual([{ title: 'Keep', url: 'https://k.example', position: 1 }]);
          });

          it('skips organic entries missing a title or url', () => {
            const { organic } = extract(payloadWith([
              { type: 'organic', title: '', url: 'https://a.example', position: { absolute: 1 } },
              { type: 'organic', title: 'No url', position: { absolute: 2 } },
              { type: 'organic', title: 'Keep', url: 'https://c.example', position: { absolute: 3 } },
            ]));
            expect(organic).toEqual([{ title: 'Keep', url: 'https://c.example', position: 3 }]);
          });

          it('falls back to rank, then list index, when position.absolute is missing', () => {
            const { organic } = extract(payloadWith([
              { type: 'organic', title: 'Ranked', url: 'https://r.example', rank: 4 },
              { type: 'organic', title: 'Indexed', url: 'https://i.example' },
            ]));
            expect(organic.map((item) => item.position)).toEqual([4, 2]);
          });

          const withLocal = (items: unknown[]) => ({
            success: true,
            data: {
              content: {
                results: [],
                serp_features: [{ type: 'local_results', items }],
              },
            },
          });

          it('matches on business name against local result titles', () => {
            const out = prismcrawl.serpExtractor({
              keyword: buildKeyword(),
              response: withLocal([{ title: 'Cenizo - Downtown' }, { title: 'Acme Plumbing' }]) as any,
              result: undefined,
              settings: { ...settings, business_name: 'acme plumbing' } as any,
            } as any);
            expect(out.mapPackTop3).toBe(true);
          });

          it('returns no organic results when the payload has no results array', () => {
            expect(extract({ success: true, data: { content: {} } }).organic).toEqual([]);
            expect(extract({}).organic).toEqual([]);
          });
        });
  });

});

describe('dataforseo', () => {




  const settings = { scraping_api: 'login@example.com:secret' } as SettingsType;

  const organic = (rank: number, host = `site${rank}.example`) => ({
      type: 'organic',
      title: `Result ${rank}`,
      url: `https://${host}/page`,
      rank_absolute: rank,
    });

  const payload = (items: unknown[], status_code = 20000) => ({
      tasks: [{ status_code, status_message: 'Ok.', result: [{ items }] }],
    });

  describe('dataforseo scraper', () => {
    afterEach(() => {
          jest.restoreAllMocks();
        });

    describe('serpExtractor', () => {
          it('returns only the requested page of organic results', () => {
            const items = Array.from({ length: 20 }, (_, i) => organic(i + 1));
            const out = dataforseo.serpExtractor({
              keyword: buildKeyword(),
              response: payload(items),
              result: payload(items).tasks,
              settings,
              pagination: { start: 10, num: 10, page: 2 },
            } as any);
            expect(out.organic).toHaveLength(10);
            expect(out.organic[0]).toEqual({ title: 'Result 11', url: 'https://site11.example/page', position: 11 });
            expect(out.organic[9].position).toBe(20);
          });

          it('skips organic items without a title or url and ignores non-organic items', () => {
            const items = [
              organic(1),
              { type: 'organic', title: 'No url', rank_absolute: 2 },
              { type: 'paid', title: 'Ad', url: 'https://ad.example', rank_absolute: 3 },
              organic(4),
            ];
            const out = dataforseo.serpExtractor({
              keyword: buildKeyword(),
              response: payload(items),
              result: payload(items).tasks,
              settings,
              pagination: { start: 0, num: 10, page: 1 },
            } as any);
            expect(out.organic.map((r) => r.position)).toEqual([1, 4]);
          });

          it('sets mapPackTop3 when the business name appears in the local_pack', () => {
            const items = [
              organic(1),
              { type: 'local_pack', title: 'Plumbers Co', rank_absolute: 1 },
              { type: 'local_pack', title: 'Other', rank_absolute: 2 },
            ];
            const out = dataforseo.serpExtractor({
              keyword: buildKeyword(),
              response: payload(items),
              result: payload(items).tasks,
              settings: { ...settings, business_name: 'Plumbers Co' } as any,
            } as any);
            expect(out.mapPackTop3).toBe(true);
          });

          it('reports false when no local_pack is present', () => {
            const items = [organic(1)];
            const out = dataforseo.serpExtractor({
              keyword: buildKeyword(),
              response: payload(items),
              result: payload(items).tasks,
              settings,
            } as any);
            expect(out.mapPackTop3).toBe(false);
          });

          it('throws with the DataForSEO status when the task failed', () => {
            const failed = payload([], 40101);
            expect(() =>
              dataforseo.serpExtractor({ keyword: buildKeyword(), response: failed, result: failed.tasks, settings } as any),
            ).toThrow(/DataForSEO error 40101/);
          });

          it('throws when the response has no tasks', () => {
            expect(() =>
              dataforseo.serpExtractor({ keyword: buildKeyword(), response: {}, result: undefined, settings } as any),
            ).toThrow(/missing tasks/);
          });
        });
  });
});

describe('valueserp', () => {
  describe('valueSerp scraper', () => {




    describe('map pack detection', () => {
          it('detects map pack when domain is in local_results top 3', () => {
            const keyword: KeywordType = {
              ID: 1,
              keyword: 'pizza restaurant',
              device: 'desktop',
              country: 'US',
              domain: 'example.com',
              lastUpdated: '',
              volume: 0,
              added: '',
              position: 0,
              sticky: false,
              history: {},
              lastResult: [],
              url: '',
              tags: [],
              updating: false,
              lastUpdateError: false,
              mapPackTop3: false,
              location: 'Austin,TX,United States',
            };

            const mockResponse = {
              organic_results: [
                { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
                { title: 'Result 2', link: 'https://other.com/page2', position: 2 },
              ],
              local_results: [
                { title: 'Pizza Place 1', website: 'https://example.com', position: 1 },
                { title: 'Pizza Place 2', website: 'https://competitor.com', position: 2 },
                { title: 'Pizza Place 3', website: 'https://another.com', position: 3 },
              ],
            };

            const extraction = valueSerp.serpExtractor!({
              keyword,
              response: mockResponse,
              result: mockResponse.organic_results,
              settings: { business_name: 'Pizza Place 1' } as any,
            });

            expect(extraction.organic).toHaveLength(2);
            expect(extraction.mapPackTop3).toBe(true);
          });

          it('returns false when domain is not in local_results', () => {
            const keyword: KeywordType = {
              ID: 1,
              keyword: 'pizza restaurant',
              device: 'desktop',
              country: 'US',
              domain: 'example.com',
              lastUpdated: '',
              volume: 0,
              added: '',
              position: 0,
              sticky: false,
              history: {},
              lastResult: [],
              url: '',
              tags: [],
              updating: false,
              lastUpdateError: false,
              mapPackTop3: false,
              location: 'Austin,TX,United States',
            };

            const mockResponse = {
              organic_results: [
                { title: 'Result 1', link: 'https://example.com/page1', position: 1 },
              ],
              local_results: [
                { title: 'Pizza Place 1', website: 'https://competitor1.com', position: 1 },
                { title: 'Pizza Place 2', website: 'https://competitor2.com', position: 2 },
                { title: 'Pizza Place 3', website: 'https://competitor3.com', position: 3 },
              ],
            };

            const extraction = valueSerp.serpExtractor!({
              keyword,
              response: mockResponse,
              result: mockResponse.organic_results,
            });

            expect(extraction.organic).toHaveLength(1);
            expect(extraction.mapPackTop3).toBe(false);
          });

          it('handles domain matching with www prefix correctly', () => {
            const keyword: KeywordType = {
              ID: 1,
              keyword: 'coffee shop',
              device: 'desktop',
              country: 'US',
              domain: 'example.com',
              lastUpdated: '',
              volume: 0,
              added: '',
              position: 0,
              sticky: false,
              history: {},
              lastResult: [],
              url: '',
              tags: [],
              updating: false,
              lastUpdateError: false,
              mapPackTop3: false,
              location: '',
            };

            const mockResponse = {
              organic_results: [],
              local_results: [
                { title: 'Shop 1', website: 'https://www.example.com', position: 1 },
              ],
            };

            const extraction = valueSerp.serpExtractor!({
              keyword,
              response: mockResponse,
              result: [],
              settings: { business_name: 'Shop 1' } as any,
            });

            expect(extraction.mapPackTop3).toBe(true);
          });

          it('detects map pack using alternative field names', () => {
            const keyword: KeywordType = {
              ID: 1,
              keyword: 'plumber near me',
              device: 'desktop',
              country: 'US',
              domain: 'example.com',
              lastUpdated: '',
              volume: 0,
              added: '',
              position: 0,
              sticky: false,
              history: {},
              lastResult: [],
              url: '',
              tags: [],
              updating: false,
              lastUpdateError: false,
              mapPackTop3: false,
              location: '',
            };

            const mockResponse = {
              organic_results: [],
              local_results: [
                { title: 'Plumber 1', link: 'https://example.com', position: 1 },
              ],
            };

            const extraction = valueSerp.serpExtractor!({
              keyword,
              response: mockResponse,
              result: [],
              settings: { business_name: 'Plumber 1' } as any,
            });

            expect(extraction.mapPackTop3).toBe(true);
          });
        });
  });
});

describe('providers delta', () => {
  describe('hasdata scraper', () => {



  });

  describe('serper scraper', () => {



  });

  describe('serpapi scraper', () => {


    describe('local results', () => {
          const keyword = { keyword: 'coffee', domain: 'acme.example', device: 'desktop' } as any;
          const localSettings = { scraping_api: 'key', business_name: 'Acme Coffee' } as any;

          it('reads local_results.places with title and links.website, and leaves url undefined when a place has no website', () => {
            const response = {
              organic_results: [],
              local_results: {
                places: [
                  { position: 1, title: 'Acme Coffee', links: { website: 'https://acme.example' } },
                  { position: 2, title: 'Other Cafe', links: { website: 'https://other.example' } },
                ],
              },
            };
            const out = serpapi.serpExtractor({ keyword, response, result: [], settings: localSettings } as any);
            expect(out.localResults).toEqual([
              { position: 1, title: 'Acme Coffee', url: 'https://acme.example' },
              { position: 2, title: 'Other Cafe', url: 'https://other.example' },
            ]);
            expect(out.mapPackTop3).toBe(true);

            const noWebsite = {
              organic_results: [],
              local_results: { places: [{ position: 1, title: 'Acme Coffee' }] },
            };
            const outNoWebsite = serpapi.serpExtractor({ keyword, response: noWebsite, result: [], settings: localSettings } as any);
            expect(outNoWebsite.localResults).toEqual([{ position: 1, title: 'Acme Coffee', url: undefined }]);
          });
        });
  });

  describe('serply scraper', () => {

  });

  describe('searchapi scraper', () => {




    it('extracts organic results and map pack coverage from the API response', () => {
          const keyword = {
            ID: 1,
            keyword: 'coffee shops',
            country: 'US',
            domain: 'example.com',
            device: 'desktop',
            lastUpdated: '',
            volume: 0,
            added: '',
            position: 0,
            sticky: false,
            history: {},
            lastResult: [],
            url: '',
            tags: [],
            updating: false,
            lastUpdateError: false,
            mapPackTop3: false,
            location: '',
          } as KeywordType;

          const response = {
            organic_results: [
              { title: 'Example', link: 'https://example.com/page', position: 1 },
              { title: 'Other', link: 'https://other.com/page', position: 2 },
            ],
            local_results: [
              { title: 'Example Maps', link: 'https://www.google.com/searchviewer/10?svid=1', position: 1 },
            ],
          };

          const extraction = searchapi.serpExtractor({
            keyword,
            response,
            result: response.organic_results,
            settings: { scraping_api: 'searchapi-key', business_name: 'Example Maps' } as any,
          });

          expect(extraction.organic).toEqual([
            { title: 'Example', url: 'https://example.com/page', position: 1 },
            { title: 'Other', url: 'https://other.com/page', position: 2 },
          ]);
          expect(extraction.mapPackTop3).toBe(true);
          expect(extraction.localResults).toEqual([
            { position: 1, title: 'Example Maps', url: 'https://www.google.com/searchviewer/10?svid=1' },
          ]);
        });

    it('parses a serialized organic-results payload and tolerates absent local results', () => {
          const extraction = searchapi.serpExtractor({
            keyword: buildKeyword(),
            response: {},
            result: JSON.stringify([{ title: 'Example', link: 'https://example.com', position: 1 }]),
            settings: {} as SettingsType,
          });

          expect(extraction.organic).toEqual([{ title: 'Example', url: 'https://example.com', position: 1 }]);
          expect(extraction.localResults).toEqual([]);
          expect(extraction.mapPackTop3).toBe(false);
        });
  });

  describe('provider response fallback contracts', () => {
      const extractors = [
        { name: 'HasData', service: hasdata, responseKey: 'organicResults', positionKey: 'position' },
        { name: 'SearchApi.io', service: searchapi, responseKey: 'organic_results', positionKey: 'position' },
        { name: 'Serply', service: serply, responseKey: 'result', positionKey: 'realPosition' },
        { name: 'SerpApi.com', service: serpapi, responseKey: 'organic_results', positionKey: 'position' },
        { name: 'Serper.dev', service: serper, responseKey: 'organic', positionKey: 'position' },
        { name: 'Value Serp', service: valueSerp, responseKey: 'organic_results', positionKey: 'position' },
      ];

      it.each(extractors)('$name extracts its documented response field when result is absent and skips incomplete rows', ({ service, responseKey, positionKey }) => {
        const rows = [
          { title: 'Coffee guide', link: 'https://example.com/coffee', [positionKey]: 2 },
          { title: 'Missing destination', [positionKey]: 3 },
          { link: 'https://example.com/no-title', [positionKey]: 4 },
        ];
        const output = service.serpExtractor!({
          keyword: buildKeyword(),
          response: { [responseKey]: rows },
          result: undefined,
          settings: {} as SettingsType,
        } as any);

        expect(output.organic).toEqual([{ title: 'Coffee guide', url: 'https://example.com/coffee', position: 2 }]);
        if ('mapPackTop3' in output) {
          expect(output.mapPackTop3).toBe(false);
          expect(output.localResults).toEqual([]);
        }
      });

      it.each(extractors)('$name rejects malformed JSON instead of silently returning empty rankings', ({ name, service }) => {
        expect(() => service.serpExtractor!({ keyword: buildKeyword(), response: {}, result: '{broken', settings: {} as SettingsType } as any))
          .toThrow(`Invalid JSON response for ${name}`);
      });
    });
});

describe('serpbase', () => {


  const settings = { scraping_api: 'sb-key', business_name: 'Kula Coffee' } as unknown as SettingsType;

  const keyword = (overrides: Partial<KeywordType> = {}) =>
      ({ keyword: 'coffee shops', country: 'US', device: 'desktop', location: '', domain: 'example.com', ...overrides } as KeywordType);



  const payload = {
      status: 0,
      local_results: [
        { title: 'HallowBean Coffee Co', position: 1, rank: 1 },
        { title: 'Kula Coffee', position: 1, rank: 2 },
      ],
      organic: [
        { title: 'Los Dos Cristianos', link: 'https://www.google.com/goto?url=abc', url: 'https://www.google.com/goto?url=abc', display_link: 'https://www.losdoscristianos.com', position: 2, rank: 1 },
        { title: 'Facebook thread', link: 'https://www.google.com/goto?url=def', display_link: 'www.facebook.com', position: 7, rank: 2 },
        { title: 'Tripadvisor', link: 'https://www.tripadvisor.com/Restaurants.html', display_link: 'https://www.tripadvisor.com', position: 10, rank: 3 },
        { title: 'Broken', display_link: 'https://nolink.example', rank: 4 },
      ],
    };

  const extract = (response: any, s = settings) => serpbase.serpExtractor({ keyword: keyword(), response, result: response.organic, settings: s } as any);

  it('uses rank for position, and the result domain when the link is a Google redirect', () => {
      const out = extract(payload);
      expect(out.organic).toEqual([
        { title: 'Los Dos Cristianos', url: 'https://www.losdoscristianos.com/', position: 1 },
        { title: 'Facebook thread', url: 'https://www.facebook.com/', position: 2 },
        { title: 'Tripadvisor', url: 'https://www.tripadvisor.com/Restaurants.html', position: 3 },
      ]);
    });

  it('keeps the redirect link when there is no usable display_link', () => {
      const out = extract({ organic: [{ title: 'X', link: 'https://www.google.com/goto?url=zzz', rank: 1 }] });
      expect(out.organic[0].url).toBe('https://www.google.com/goto?url=zzz');
    });

  it('uses the response organic list when no result payload is supplied and skips incomplete rows', () => {
      const out = serpbase.serpExtractor({
        keyword: keyword(),
        response: { organic: [
          { title: 'Valid result', url: 'https://example.com', rank: 2 },
          { title: 'Missing URL' },
          { url: 'https://missing-title.example' },
        ] },
        settings,
      } as any);

      expect(out.organic).toEqual([{ title: 'Valid result', url: 'https://example.com', position: 2 }]);
    });
});

describe('DataForSEO extractor pagination', () => {
    const serpItems = [
      { type: 'paid', title: 'Ad 1', url: 'https://ad-1.com/' },
      { type: 'paid', title: 'Ad 2', url: 'https://ad-2.com/' },
      { type: 'organic', title: 'R1', url: 'https://r1.com/', rank_absolute: 3 },
      { type: 'organic', title: 'R2', url: 'https://r2.com/', rank_absolute: 4 },
      { type: 'organic', title: 'R3', url: 'https://r3.com/', rank_absolute: 5 },
      { type: 'organic', title: 'R4', url: 'https://r4.com/', rank_absolute: 6 },
      { type: 'organic', title: 'R5', url: 'https://r5.com/', rank_absolute: 7 },
      { type: 'organic', title: 'R6', url: 'https://r6.com/', rank_absolute: 8 },
      { type: 'organic', title: 'R7', url: 'https://r7.com/', rank_absolute: 9 },
      { type: 'organic', title: 'R8', url: 'https://r8.com/', rank_absolute: 10 },
      { type: 'organic', title: 'R9', url: 'https://r9.com/', rank_absolute: 11 },
      { type: 'organic', title: 'R10', url: 'https://r10.com/', rank_absolute: 12 },
      { type: 'organic', title: 'R11', url: 'https://r11.com/', rank_absolute: 13 },
    ];
    const response = { tasks: [{ status_code: 20000, result: [{ items: serpItems }] }] };
    const keyword = { keyword: 'coffee', domain: 'r9.com', country: 'US', device: 'desktop' } as any;

    it('returns only the ranks in the requested page, counting ads in the rank', () => {
      const { organic } = dataforseo.serpExtractor!({
        keyword,
        response,
        result: undefined,
        settings: {} as any,
        pagination: { start: 0, num: 10, page: 1 },
      } as any);

      expect(organic.map((item) => item.position)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('returns the next page by absolute rank instead of slicing the organic list', () => {
      const { organic } = dataforseo.serpExtractor!({
        keyword,
        response,
        result: undefined,
        settings: {} as any,
        pagination: { start: 10, num: 10, page: 2 },
      } as any);

      expect(organic.map((item) => item.position)).toEqual([11, 12, 13]);
    });
  });

describe('CrazySERP extractor', () => {
    it('does not throw when the payload is an object without an organic list', () => {
      const extract = () => crazyserp.serpExtractor!({
        keyword: {} as any,
        response: {},
        result: JSON.stringify({ message: 'no results' }),
        settings: {} as any,
      } as any);

      expect(extract()).toEqual({ organic: [], mapPackTop3: false, localResults: [] });
    });

    it('reads the organic list from an object payload', () => {
      const { organic } = crazyserp.serpExtractor!({
        keyword: {} as any,
        response: {},
        result: JSON.stringify({ organic: [{ title: 'A', url: 'https://a.com/', position: 1 }] }),
        settings: {} as any,
      } as any);

      expect(organic).toEqual([{ title: 'A', url: 'https://a.com/', position: 1 }]);
    });
  });
