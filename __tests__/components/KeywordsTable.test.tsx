import { render, screen, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import KeywordsTable from '../../components/keywords/KeywordsTable';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('next/router', () => ({
   useRouter: () => ({
      push: jest.fn(),
      pathname: '/',
      query: { slug: 'test-domain' },
   }),
}));

jest.mock('../../services/keywords', () => ({
   useDeleteKeywords: () => ({ mutate: jest.fn() }),
   useFavKeywords: () => ({ mutate: jest.fn() }),
   useRefreshKeywords: () => ({ mutate: jest.fn() }),
}));

const mockUpdateSettings = jest.fn();
let mockStoredSettings: Record<string, unknown> | undefined;

jest.mock('../../services/settings', () => ({
   useUpdateSettings: () => ({ mutate: mockUpdateSettings }),
   useFetchSettings: () => ({ data: mockStoredSettings ? { settings: mockStoredSettings } : undefined }),
}));

jest.mock('../../hooks/useIsMobile', () => () => [false]);
jest.mock('../../hooks/useWindowResize', () => () => {});

jest.mock('../../utils/client/sortFilter', () => ({
   filterKeywords: (keywords: any[], filterParams: any) => keywords.filter((k: any) => (
      filterParams.tags.length === 0 || filterParams.tags.some((tag: string) => k.tags.includes(tag))
   )),
   sortKeywords: (keywords: any[]) => keywords,
   keywordsByDevice: (keywords: any[], device: string) => ({ [device]: keywords }),
}));

jest.mock('../../components/common/Icon', () => {
   const MockIcon = ({ type }: { type: string }) => <span data-testid={`icon-${type}`} />;
   MockIcon.displayName = 'MockIcon';
   return MockIcon;
});

jest.mock('../../components/keywords/KeywordFilter', () => {
   const MockKeywordFilters = ({
      filterParams,
      allTags,
      filterKeywords,
      updateColumns,
   }: {
      filterParams: any;
      allTags: string[];
      filterKeywords: (params: any) => void;
      updateColumns?: (column: string) => void;
   }) => (
      <div data-testid="keyword-filters">
         <span data-testid="active-tags">{filterParams.tags.join(',')}</span>
         <span data-testid="all-tags">{allTags.join(',')}</span>
         <button
            data-testid="set-seo-filter"
            onClick={() => filterKeywords({ countries: [], tags: ['seo'], search: '' })}
         >
            Filter by seo
         </button>
         <button data-testid="toggle-volume-column" onClick={() => updateColumns?.('Volume')}>Toggle Volume</button>
      </div>
   );
   MockKeywordFilters.displayName = 'MockKeywordFilters';
   return MockKeywordFilters;
});

jest.mock('../../components/keywords/Keyword', () => {
   const MockKeyword = ({ keywordData }: { keywordData: any }) => (
      <div data-testid={`keyword-${keywordData.ID}`}>{keywordData.keyword}</div>
   );
   MockKeyword.displayName = 'MockKeyword';
   return MockKeyword;
});

jest.mock('react-window', () => ({
   FixedSizeList: ({ children, itemData, itemCount }: any) => (
      <div data-testid="virtualized-list">
         {Array.from({ length: itemCount }, (_, index) =>
            children({ data: itemData, index, style: {} })
         )}
      </div>
   ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeKeyword = (id: number, keyword: string, tags: string[]): any => ({
   ID: id,
   keyword,
   device: 'desktop',
   country: 'US',
   domain: 'example.com',
   location: '',
   lastUpdated: '2024-01-01',
   added: '2024-01-01',
   position: 5,
   volume: 100,
   history: {},
   tags,
   url: 'https://example.com',
   sticky: false,
   updating: false,
   lastUpdateError: false,
   mapPackTop3: false,
});

const buildClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KeywordsTable – stale tag filter cleanup', () => {
   it('clears stale tag from filterParams when all keywords with that tag are removed', async () => {
      const initialKeywords = [makeKeyword(1, 'seo tips', ['seo'])];

      const { rerender } = render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               keywords={initialKeywords}
               isLoading={false}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      // Activate the 'seo' tag filter via the mock button
      fireEvent.click(screen.getByTestId('set-seo-filter'));
      expect(screen.getByTestId('active-tags').textContent).toBe('seo');

      // Delete all keywords that have the 'seo' tag
      await act(async () => {
         rerender(
            <QueryClientProvider client={buildClient()}>
               <KeywordsTable
                  keywords={[]}
                  isLoading={false}
                  isConsoleIntegrated={false}
               />
            </QueryClientProvider>
         );
      });

      // The stale 'seo' tag should have been stripped from the active filter
      expect(screen.getByTestId('active-tags').textContent).toBe('');
   });

   it('preserves tag in filterParams when keywords with that tag still exist after deletion', async () => {
      const initialKeywords = [
         makeKeyword(1, 'seo tips', ['seo']),
         makeKeyword(2, 'link building', ['seo', 'links']),
      ];

      const { rerender } = render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               keywords={initialKeywords}
               isLoading={false}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      // Activate the 'seo' tag filter
      fireEvent.click(screen.getByTestId('set-seo-filter'));
      expect(screen.getByTestId('active-tags').textContent).toBe('seo');

      // Remove keyword 1 but keep keyword 2 which still carries the 'seo' tag
      await act(async () => {
         rerender(
            <QueryClientProvider client={buildClient()}>
               <KeywordsTable
                  keywords={[makeKeyword(2, 'link building', ['seo', 'links'])]}
                  isLoading={false}
                  isConsoleIntegrated={false}
               />
            </QueryClientProvider>
         );
      });

      // 'seo' still exists on the remaining keyword, so the active filter must not change
      expect(screen.getByTestId('active-tags').textContent).toBe('seo');
   });

   it('shows remaining keywords instead of a blank screen when a stale tag filter is cleared', async () => {
      // Two keywords: one tagged 'seo', one tagged 'links'
      const initialKeywords = [
         makeKeyword(1, 'seo tips', ['seo']),
         makeKeyword(2, 'link building', ['links']),
      ];

      const { rerender } = render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               keywords={initialKeywords}
               isLoading={false}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      // Activate the 'seo' tag filter; only keyword 1 should be visible
      fireEvent.click(screen.getByTestId('set-seo-filter'));
      expect(screen.getByTestId('active-tags').textContent).toBe('seo');
      expect(screen.getByTestId('keyword-1')).toBeInTheDocument();
      expect(screen.queryByTestId('keyword-2')).not.toBeInTheDocument();

      // Delete the 'seo tips' keyword; only 'link building' (tagged 'links') remains
      await act(async () => {
         rerender(
            <QueryClientProvider client={buildClient()}>
               <KeywordsTable
                  keywords={[makeKeyword(2, 'link building', ['links'])]}
                  isLoading={false}
                  isConsoleIntegrated={false}
               />
            </QueryClientProvider>
         );
      });

      // Stale 'seo' filter should be cleared and the remaining keyword should be visible
      expect(screen.getByTestId('active-tags').textContent).toBe('');
      expect(screen.getByTestId('keyword-2')).toBeInTheDocument();
   });
});

describe('KeywordsTable – column settings save', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      mockStoredSettings = undefined;
   });

   it('sends only the changed keywordsColumns, without the refresh token', () => {
      mockStoredSettings = {
         scraper_type: 'serpapi',
         smtp_server: 'smtp.example.com',
         adwords_refresh_token: 'stored-refresh-token',
         keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
      };

      render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               keywords={[makeKeyword(1, 'seo tips', ['seo'])]}
               isLoading={false}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      fireEvent.click(screen.getByTestId('toggle-volume-column'));

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
      const savedPayload = mockUpdateSettings.mock.calls[0][0];
      expect(savedPayload).toEqual({
         keywordsColumns: ['Best', 'History', 'Search Console'],
      });
      expect(savedPayload).not.toHaveProperty('adwords_refresh_token');
   });
});
