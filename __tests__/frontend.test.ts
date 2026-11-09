import { act, render, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ColumnFiltersState, useTable } from '@tanstack/react-table';
import { dataTableFeatures } from 'app/(dashboard)/_components/data-table/features';
import { createTrackerColumns } from 'app/(dashboard)/domain/[slug]/_components/tracker-columns';
import { DEFAULT_FILTERS, SORT_CHOICES, STICKY_FIRST, TrackerFilters, choiceForSorting, sortingForChoice, toColumnFilters } from 'app/(dashboard)/domain/[slug]/_components/tracker-state';
import { NO_TAGS_FILTER } from 'utils/client/sortFilter';
import { createIdeaColumns } from 'app/(dashboard)/_components/keyword-ideas/ideas-columns';
import { DEFAULT_IDEA_SORT, IDEA_SORT_CHOICES, IdeaRow, buildIdeaGroups, ideaChoiceFor, ideaSortingFor } from 'app/(dashboard)/_components/keyword-ideas/ideas-state';
import { useNearViewport } from 'hooks/use-near-viewport';
import { buildAddKeywordPayloads } from 'app/(dashboard)/_components/keyword-ideas/add-to-tracker-state';
import { useTrackedKeywordsForAdd } from 'app/(dashboard)/domain/_components/keyword-queries';
import { useAppSettings } from 'app/(dashboard)/_components/settings/settings-queries';
import * as apiClient from 'utils/client/apiClient';

jest.mock('utils/client/apiClient', () => ({
   ...jest.requireActual('utils/client/apiClient'),
   apiGet: jest.fn(),
}));

describe('useNearViewport', () => {
   const originalObserver = globalThis.IntersectionObserver;
   let callback: IntersectionObserverCallback;
   let observed: Element | undefined;
   let observerOptions: IntersectionObserverInit | undefined;
   let disconnect: jest.Mock;

   beforeEach(() => {
      disconnect = jest.fn();
      class MockIntersectionObserver {
         constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            callback = cb;
            observerOptions = options;
         }
         // eslint-disable-next-line class-methods-use-this
         observe(element: Element) { observed = element; }
         // eslint-disable-next-line class-methods-use-this
         unobserve() {}
         disconnect = disconnect;
         // eslint-disable-next-line class-methods-use-this
         takeRecords() { return []; }
      }
      Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: MockIntersectionObserver });
   });

   afterEach(() => {
      Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: originalObserver });
   });

   it('does not report near until the observer intersects, then disconnects', () => {
      const Probe = () => {
         const [ref, near] = useNearViewport<HTMLDivElement>();
         return React.createElement('div', { ref, 'data-near': String(near) });
      };
      const { container } = render(React.createElement(Probe));
      const observer = {} as IntersectionObserver;

      expect(container.firstElementChild?.getAttribute('data-near')).toBe('false');
      expect(observerOptions?.rootMargin).toBe('300px');
      expect(observed).toBe(container.firstElementChild);

      act(() => callback([{ isIntersecting: true, target: observed! } as IntersectionObserverEntry], observer));

      expect(container.firstElementChild?.getAttribute('data-near')).toBe('true');
      expect(disconnect).toHaveBeenCalled();
   });
});

describe('Discover add-time duplicate checks', () => {
   it('skips only the same keyword, device, country, and selected location', () => {
      const tracked = [{ keyword: 'plumber', country: 'US', device: 'desktop', location: 'Austin,TX,US' }];
      const common = { items: [{ keyword: 'plumber', country: 'US' }], domain: 'example.com', devices: ['desktop' as const], tags: [], country: 'US', tracked };

      const sameLocation = buildAddKeywordPayloads({ ...common, location: 'Austin,TX,US' });
      const otherLocation = buildAddKeywordPayloads({ ...common, location: 'Dallas,TX,US' });
      const countryOnly = buildAddKeywordPayloads({ ...common, location: '' });

      expect(sameLocation.payloads).toHaveLength(0);
      expect(sameLocation.skipped).toEqual(['plumber (desktop)']);
      expect(otherLocation.payloads).toHaveLength(1);
      expect(countryOnly.payloads).toHaveLength(1);
   });
});

describe('tracked keyword fetch for add flows', () => {
   it('waits until enabled and then refreshes even a cached keyword list', async () => {
      const apiGet = apiClient.apiGet as jest.Mock;
      apiGet.mockResolvedValue({ keywords: [] });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const key = ['keywords', 'example.com'] as const;
      queryClient.setQueryData(key, []);
      const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children);
      const { rerender } = renderHook(({ enabled }) => useTrackedKeywordsForAdd('example.com', enabled), {
         initialProps: { enabled: false }, wrapper,
      });

      expect(apiGet).not.toHaveBeenCalled();
      rerender({ enabled: true });
      await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/serp/keywords?domain=example.com'));
      apiGet.mockReset();
      queryClient.clear();
   });
});

describe('app settings fetch for add dialogs', () => {
   it('waits until enabled and refreshes settings when the add dialog opens', async () => {
      const apiGet = apiClient.apiGet as jest.Mock;
      apiGet.mockResolvedValue({ settings: { scraper_type: 'scrapingant' } });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(['settings'], { scraper_type: 'old-value' });
      const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: queryClient }, children);
      const { rerender } = renderHook(({ enabled }) => useAppSettings(enabled, true), {
         initialProps: { enabled: false }, wrapper,
      });

      expect(apiGet).not.toHaveBeenCalled();
      rerender({ enabled: true });
      await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/app/settings'));
      await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
      apiGet.mockReset();
      queryClient.clear();
   });
});

describe('Tracker table', () => {
  // The Tracker's sort and filter rules live in its column definitions. These tests drive the real columns through a real
  // table, so they cover what the screen does, not a copy of it.

  const noop = () => undefined;
  const columns = (scPeriod = 'threeDays') => createTrackerColumns({
     allowsCity: false, scPeriod, onOpenDetails: noop, onRefresh: noop, onToggleFavorite: noop, onManageTags: noop, onRemove: noop,
  });

  const keyword = (ID: number, overrides: Partial<KeywordType> = {}): KeywordType => ({
     ID, keyword: `kw ${ID}`, device: 'desktop', country: 'US', domain: 'example.com', lastUpdated: '2026-01-01', added: `2026-01-0${ID}`,
     position: ID, volume: 0, sticky: false, history: {}, lastResult: [], url: '', tags: [], updating: false, lastUpdateError: false,
     ...overrides,
  } as KeywordType);

  type Options = { sort?: string; filters?: Partial<TrackerFilters>; scPeriod?: string; withFavoritesFirst?: boolean };

  /** IDs of the rows the table would show, in order. Favorites-first is what the screen always adds ahead of the chosen sort. */
  const idsFor = (data: KeywordType[], { sort = 'date_asc', filters = {}, scPeriod, withFavoritesFirst = true }: Options = {}): number[] => {
     const sorting = withFavoritesFirst ? [STICKY_FIRST, ...sortingForChoice(sort)] : sortingForChoice(sort);
     const { result } = renderHook(() => useTable({
        features: dataTableFeatures,
        data,
        columns: columns(scPeriod),
        getRowId: (row) => String(row.ID),
        state: { sorting, columnFilters: toColumnFilters({ ...DEFAULT_FILTERS, ...filters }) },
     }));
     return result.current.getRowModel().rows.map((row) => row.original.ID);
  };

  describe('Tracker sorting', () => {
     it('shows favorites first, whatever the chosen sort is', () => {
        const data = [keyword(1), keyword(2, { sticky: true }), keyword(3), keyword(4, { sticky: true })];

        expect(idsFor(data, { sort: 'date_asc' })).toEqual([2, 4, 1, 3]);
        expect(idsFor(data, { sort: 'date_desc' })).toEqual([4, 2, 3, 1]);
        expect(idsFor(data, { sort: 'date_asc', withFavoritesFirst: false })).toEqual([1, 2, 3, 4]);
     });

     it('sorts by position with unranked keywords (0) after the ranked ones, and first on "Lowest Position"', () => {
        const data = [keyword(1, { position: 5 }), keyword(2, { position: 0 }), keyword(3, { position: 1 }), keyword(4, { position: 20 })];

        expect(idsFor(data, { sort: 'pos_asc' })).toEqual([3, 1, 4, 2]);
        expect(idsFor(data, { sort: 'pos_desc' })).toEqual([2, 4, 1, 3]);
     });

     it('sorts by date added, alphabetically, and by search volume', () => {
        const data = [
           keyword(1, { keyword: 'banana', added: '2026-03-01', volume: 50 }),
           keyword(2, { keyword: 'Apple', added: '2026-01-01', volume: 900 }),
           keyword(3, { keyword: 'cherry', added: '2026-02-01', volume: 10 }),
        ];

        expect(idsFor(data, { sort: 'date_asc' })).toEqual([2, 3, 1]);
        expect(idsFor(data, { sort: 'date_desc' })).toEqual([1, 3, 2]);
        expect(idsFor(data, { sort: 'alpha_asc' })).toEqual([2, 1, 3]);
        expect(idsFor(data, { sort: 'alpha_desc' })).toEqual([3, 1, 2]);
        expect(idsFor(data, { sort: 'vol_desc' })).toEqual([2, 1, 3]);
        expect(idsFor(data, { sort: 'vol_asc' })).toEqual([3, 1, 2]);
     });

     it('sorts by the Search Console impressions and visits of the selected period', () => {
        const sc = (impressions: number, visits: number, period = 'threeDays') => ({
           impressions: { [period]: impressions }, visits: { [period]: visits }, ctr: {}, position: {},
        }) as unknown as KeywordSCData;
        const data = [keyword(1, { scData: sc(10, 9) }), keyword(2, { scData: sc(500, 1) }), keyword(3), keyword(4, { scData: sc(60, 40) })];

        expect(idsFor(data, { sort: 'imp_desc' })).toEqual([2, 4, 1, 3]);
        expect(idsFor(data, { sort: 'imp_asc' })).toEqual([3, 1, 4, 2]);
        expect(idsFor(data, { sort: 'visits_desc' })).toEqual([4, 1, 2, 3]);
        // A keyword with no data for the chosen period counts as 0.
        expect(idsFor(data, { sort: 'imp_desc', scPeriod: 'sevenDays' })).toEqual([1, 2, 3, 4]);
     });

     it('maps every sort choice to table sorting and back, and falls back to the default for an unknown choice', () => {
        SORT_CHOICES.forEach((choice) => expect(choiceForSorting([STICKY_FIRST, ...sortingForChoice(choice.value)])).toBe(choice.value));
        expect(sortingForChoice('nope')).toEqual(sortingForChoice('date_asc'));
        expect(choiceForSorting([{ id: 'url', desc: false }])).toBe('');
     });
  });

  describe('Tracker filtering', () => {
     const data = [
        keyword(1, { device: 'desktop', country: 'US', tags: ['seo'] }),
        keyword(2, { device: 'mobile', country: 'US', tags: ['seo', 'local'] }),
        keyword(3, { device: 'desktop', country: 'CA', tags: [], keyword: 'Maple Syrup' }),
        keyword(4, { device: 'desktop', country: 'US', tags: ['local'] }),
     ];

     it('shows one device at a time', () => {
        expect(idsFor(data, { filters: { device: 'desktop' } })).toEqual([1, 3, 4]);
        expect(idsFor(data, { filters: { device: 'mobile' } })).toEqual([2]);
     });

     it('filters by country, and an empty country list means all', () => {
        expect(idsFor(data, { filters: { countries: ['CA'] } })).toEqual([3]);
        expect(idsFor(data, { filters: { countries: [] } })).toEqual([1, 3, 4]);
     });

     it('filters by tag, and "No Tags" matches only keywords without tags', () => {
        expect(idsFor(data, { filters: { tags: ['local'] } })).toEqual([4]);
        expect(idsFor(data, { filters: { tags: [NO_TAGS_FILTER] } })).toEqual([3]);
     });

     it('filters by search text without caring about case', () => {
        expect(idsFor(data, { filters: { search: 'maple' } })).toEqual([3]);
        expect(idsFor(data, { filters: { search: 'nothing like this' } })).toEqual([]);
     });
  });
});

describe('Ideas table', () => {
  // The Ideas table is used by the Research page and by each domain's Ideas page. These tests drive its real columns.

  const noop = () => undefined;
  const idea = (uid: string, keywordText: string, avgMonthlySearches: number, competitionIndex = 0): IdeaRow => ({
     uid, keyword: keywordText, country: 'US', avgMonthlySearches, competitionIndex, competition: 'LOW', monthlySearchVolumes: {},
  } as unknown as IdeaRow);

  const idsFor = (data: IdeaRow[], sort: string, columnFilters: ColumnFiltersState = []): string[] => {
     const { result } = renderHook(() => useTable({
        features: dataTableFeatures,
        data,
        columns: createIdeaColumns({ favoriteIds: new Set<string>(), onOpenDetails: noop, onToggleFavorite: noop }),
        getRowId: (row) => row.uid,
        state: { sorting: ideaSortingFor(sort), columnFilters },
     }));
     return result.current.getRowModel().rows.map((row) => row.id);
  };

  describe('Ideas table', () => {
     const data = [
        idea('a', 'tattoo removal cost', 500, 80),
        idea('b', 'Laser tattoo removal', 5000, 20),
        idea('c', 'tattoo removal near me', 50, 55),
     ];

     it('starts on highest search volume and maps each sort choice to table sorting and back', () => {
        expect(DEFAULT_IDEA_SORT).toBe('vol_desc');
        IDEA_SORT_CHOICES.forEach((choice) => expect(ideaChoiceFor(ideaSortingFor(choice.value))).toBe(choice.value));
        expect(ideaChoiceFor([{ id: 'trend', desc: false }])).toBe('');
     });

     it('sorts by volume, competition and keyword (ignoring case)', () => {
        expect(idsFor(data, 'vol_desc')).toEqual(['b', 'a', 'c']);
        expect(idsFor(data, 'vol_asc')).toEqual(['c', 'a', 'b']);
        expect(idsFor(data, 'competition_desc')).toEqual(['a', 'c', 'b']);
        expect(idsFor(data, 'competition_asc')).toEqual(['b', 'c', 'a']);
        expect(idsFor(data, 'alpha_asc')).toEqual(['b', 'a', 'c']);
        expect(idsFor(data, 'alpha_desc')).toEqual(['c', 'a', 'b']);
     });

     it('filters by search text and by phrase group, in either word order', () => {
        expect(idsFor(data, 'vol_desc', [{ id: 'keyword', value: 'NEAR' }])).toEqual(['c']);
        expect(idsFor(data, 'vol_desc', [{ id: 'groups', value: ['removal tattoo'] }])).toEqual(['b', 'a', 'c']);
        expect(idsFor(data, 'vol_desc', [{ id: 'groups', value: ['laser tattoo (1)'] }])).toEqual(['b']);
     });

     it('offers phrase groups of three or more ideas, and each count equals what the group filters to', () => {
        const many = [
           idea('1', 'tattoo removal cost', 1), idea('2', 'tattoo removal near me', 1), idea('3', 'removal tattoo prices', 1),
           idea('4', 'laser hair', 1), idea('5', 'laser pricing', 1),
        ];

        const groups = buildIdeaGroups(many);

        expect(groups).toEqual(['tattoo removal (3)']);
        expect(idsFor(many, 'vol_desc', [{ id: 'groups', value: groups }])).toHaveLength(3);
     });

     it('keeps every idea selectable until a location is chosen in the add dialog', () => {
        const row = idea('already-tracked', 'plumber', 100);
        const { result } = renderHook(() => useTable({
           features: dataTableFeatures,
           data: [row],
           columns: createIdeaColumns({ favoriteIds: new Set<string>(), onOpenDetails: noop, onToggleFavorite: noop }),
           getRowId: (item) => item.uid,
        }));

        expect(result.current.getRowModel().rows[0].getCanSelect()).toBe(true);
     });
  });
});

describe('Domain screenshots', () => {
  type FetchDomainScreenshot = (domain: string, forceFetch?: boolean) => Promise<string | false>;

  describe('fetchDomainScreenshot cache resilience', () => {
     const originalFetch = global.fetch;

     beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
        if (!originalFetch) {
           (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
        }
     });

     afterEach(() => {
        if (!originalFetch) {
           delete (global as unknown as { fetch?: jest.Mock }).fetch;
        }
     });

     it.each([
        ['invalid JSON string', 'not-json'],
        ['a JSON array', '[]'],
        ['a JSON primitive', 'true'],
        ['an object with non-entry values (number)', '{"domain":123}'],
        ['an object with plain string values (old cache format)', '{"domain.com":"data:image/png;base64,abc"}'],
     ])('clears invalid cached thumbnails (%s) before fetching', async (_name, invalidCache) => {
        localStorage.setItem('domainThumbs', invalidCache);

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBeNull();

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
     });

     it('clears cached thumbnails when values contain non-string data', async () => {
        localStorage.setItem('domainThumbs', JSON.stringify({
           'example.com': 'data:image/png;base64,validstring',
           'test.com': 123,
           'another.com': 'valid-string'
        }));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBeNull();

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
     });

     it('clears cached thumbnails when data is an array instead of object', async () => {
        localStorage.setItem('domainThumbs', JSON.stringify([
           'data:image/png;base64,somedata',
           'data:image/png;base64,otherdata'
        ]));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBeNull();

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
     });

     it('returns cached data without fetching when entry is fresh', async () => {
        const now = Date.now();
        const validCache = {
           'example.com': { data: 'data:image/png;base64,validdata', ts: now },
           'test.com': { data: 'data:image/png;base64,anothervalid', ts: now }
        };
        localStorage.setItem('domainThumbs', JSON.stringify(validCache));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject('Should not fetch'));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(result).toBe('data:image/png;base64,validdata');
        expect(fetchSpy).not.toHaveBeenCalled();

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
     });

     it('refetches when entry is stale (older than TTL)', async () => {
        const staleTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
        const staleCache = {
           'example.com': { data: 'data:image/png;base64,staledata', ts: staleTs }
        };
        localStorage.setItem('domainThumbs', JSON.stringify(staleCache));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);

        await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockRestore();
     });

     it('forceFetch bypasses the TTL check and always refetches', async () => {
        const now = Date.now();
        const freshCache = {
           'example.com': { data: 'data:image/png;base64,freshdata', ts: now }
        };
        localStorage.setItem('domainThumbs', JSON.stringify(freshCache));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);

        await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com', true);

        expect(fetchSpy).toHaveBeenCalledTimes(1);

        fetchSpy.mockRestore();
     });

     it('clears cached thumbnails when values contain objects (not DomainThumbEntry)', async () => {
        localStorage.setItem('domainThumbs', JSON.stringify({
           'example.com': { url: 'data:image/png;base64,validdata' },
           'test.com': 'valid-string'
        }));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBeNull();

        fetchSpy.mockRestore();
        warnSpy.mockRestore();
     });

     it('handles empty valid object cache correctly', async () => {
        localStorage.setItem('domainThumbs', JSON.stringify({}));

        let fetchDomainScreenshot: FetchDomainScreenshot | undefined;
        jest.isolateModules(() => {
           const mod = require('../app/(dashboard)/domains/_components/screenshots');
           fetchDomainScreenshot = mod.fetchDomainScreenshot;
        });

        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
           status: 500,
           blob: jest.fn(),
        } as unknown as Response);

        const result = await (fetchDomainScreenshot as FetchDomainScreenshot)('example.com');

        expect(result).toBe(false);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('domainThumbs')).toBe('{}');

        fetchSpy.mockRestore();
     });
  });
});
