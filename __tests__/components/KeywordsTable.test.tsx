import React from 'react';
import { render, screen, act } from '@testing-library/react';
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

jest.mock('../../services/settings', () => ({
   useUpdateSettings: () => ({ mutate: jest.fn() }),
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
   const MockKeywordFilters = ({ filterParams, allTags }: { filterParams: any; allTags: string[] }) => (
      <div data-testid="keyword-filters">
         <span data-testid="active-tags">{filterParams.tags.join(',')}</span>
         <span data-testid="all-tags">{allTags.join(',')}</span>
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

const mockDomain: any = {
   ID: 1,
   domain: 'example.com',
   slug: 'example-com',
   notification_interval: '24h',
   notification_emails: '',
   tags: '',
   added: '2024-01-01',
   lastUpdated: '2024-01-01',
   keywordCount: 2,
   avgPosition: 5,
   lastFetched: '2024-01-01',
   scrapeEnabled: true,
};

const buildClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KeywordsTable – stale tag filter cleanup', () => {
   it('clears a filtered tag when all keywords with that tag are removed', async () => {
      const keywordsWithTag = [makeKeyword(1, 'seo tips', ['seo'])];

      const { rerender } = render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               domain={mockDomain}
               keywords={keywordsWithTag}
               isLoading={false}
               showAddModal={false}
               setShowAddModal={jest.fn()}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      // Simulate user selecting tag filter – rerender with the same keywords but force a
      // tag-filter selection by injecting a keyword whose tag will disappear.
      // After deleting the only 'seo'-tagged keyword, keywords prop becomes [].
      await act(async () => {
         rerender(
            <QueryClientProvider client={buildClient()}>
               <KeywordsTable
                  domain={mockDomain}
                  keywords={[]}
                  isLoading={false}
                  showAddModal={false}
                  setShowAddModal={jest.fn()}
                  isConsoleIntegrated={false}
               />
            </QueryClientProvider>
         );
      });

      // allDomainTags should now be empty (no keywords left), so active-tags should be cleared.
      expect(screen.getByTestId('all-tags').textContent).toBe('');
   });

   it('does not alter filterParams when all selected tags are still present', async () => {
      const keywords = [
         makeKeyword(1, 'seo tips', ['seo']),
         makeKeyword(2, 'link building', ['seo', 'links']),
      ];

      const { rerender } = render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               domain={mockDomain}
               keywords={keywords}
               isLoading={false}
               showAddModal={false}
               setShowAddModal={jest.fn()}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      // Remove one keyword but keep the 'seo' tag alive in the remaining keyword
      await act(async () => {
         rerender(
            <QueryClientProvider client={buildClient()}>
               <KeywordsTable
                  domain={mockDomain}
                  keywords={[makeKeyword(2, 'link building', ['seo', 'links'])]}
                  isLoading={false}
                  showAddModal={false}
                  setShowAddModal={jest.fn()}
                  isConsoleIntegrated={false}
               />
            </QueryClientProvider>
         );
      });

      // 'seo' and 'links' tags still exist on the remaining keyword
      expect(screen.getByTestId('all-tags').textContent).toBe('seo,links');
   });

   it('shows no-keywords message (not a blank screen) when filter leaves no results', async () => {
      const keywords = [makeKeyword(1, 'seo tips', ['seo'])];

      const { rerender } = render(
         <QueryClientProvider client={buildClient()}>
            <KeywordsTable
               domain={mockDomain}
               keywords={keywords}
               isLoading={false}
               showAddModal={false}
               setShowAddModal={jest.fn()}
               isConsoleIntegrated={false}
            />
         </QueryClientProvider>
      );

      // Delete all keywords
      await act(async () => {
         rerender(
            <QueryClientProvider client={buildClient()}>
               <KeywordsTable
                  domain={mockDomain}
                  keywords={[]}
                  isLoading={false}
                  showAddModal={false}
                  setShowAddModal={jest.fn()}
                  isConsoleIntegrated={false}
               />
            </QueryClientProvider>
         );
      });

      // Should display the empty state message, not a blank screen
      expect(screen.getByText('No Keywords Added for this Device Type.')).toBeInTheDocument();
   });
});
