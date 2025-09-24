import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import SCKeywordsTable from '../../app/components/keywords/SCKeywordsTable';

// Mock the required hooks and services
jest.mock('next/router', () => ({
   useRouter: () => ({
      push: jest.fn(),
      pathname: '/domain/console/test-domain',
      query: { slug: 'test-domain' },
   }),
}));

jest.mock('../../app/services/keywords', () => ({
   useFetchKeywords: jest.fn(() => ({
      keywordsData: {
         keywords: [
            {
               ID: 1,
               keyword: 'tracked keyword',
               device: 'desktop',
               country: 'US',
               location: 'United States',
               domain: 'example.com',
               lastUpdated: '2024-01-01',
               added: '2024-01-01',
               position: 5,
            }
         ]
      }
   })),
   useAddKeywords: () => ({ mutate: jest.fn() }),
}));

jest.mock('../../app/hooks/useIsMobile', () => () => [false]);
jest.mock('../../app/hooks/useWindowResize', () => () => {});

// Mock filter and sort functions
jest.mock('../../app/utils/client/SCsortFilter', () => ({
   SCfilterKeywords: (keywords: any[]) => keywords,
   SCsortKeywords: (keywords: any[]) => keywords,
   SCkeywordsByDevice: (keywords: any[], device: string) => ({ [device]: keywords }),
}));

// Mock Icon component
jest.mock('../../app/components/common/Icon', () => {
   const MockIcon = ({ type, title }: { type: string; title?: string }) => (
      <span data-testid={`icon-${type}`} title={title}>✓</span>
   );
   MockIcon.displayName = 'MockIcon';
   return MockIcon;
});


// Mock KeywordFilters component
jest.mock('../../app/components/keywords/KeywordFilter', () => {
   const MockKeywordFilters = () => <div>Keyword Filters</div>;
   MockKeywordFilters.displayName = 'MockKeywordFilters';
   return MockKeywordFilters;
});

// Mock FixedSizeList
jest.mock('react-window', () => ({
   FixedSizeList: ({ children, itemData, itemCount }: any) => (
      <div data-testid="virtualized-list">
         {Array.from({ length: itemCount }, (_, index) => 
            children({ data: itemData, index, style: {} })
         )}
      </div>
   ),
}));

describe('SCKeywordsTable', () => {
   const queryClient = new QueryClient({
      defaultOptions: {
         queries: {
            retry: false,
         },
      },
   });

   const mockDomain = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
      notification_interval: '24h',
      notification_emails: '',
      tags: '',
      added: '2024-01-01',
      lastUpdated: '2024-01-01',
      keywordCount: 1,
      avgPosition: 10.5,
      lastFetched: '2024-01-01',
   };

   const mockSCKeywords = [
      {
         uid: 'sc-keyword-1',
         keyword: 'tracked keyword',
         country: 'US',
         device: 'desktop',
         position: 3,
         impressions: 1000,
         clicks: 50,
         ctr: 0.05,
      },
      {
         uid: 'sc-keyword-2', 
         keyword: 'untracked keyword',
         country: 'US',
         device: 'desktop',
         position: 7,
         impressions: 500,
         clicks: 25,
         ctr: 0.05,
      },
   ];

   const renderComponent = () => render(
      <QueryClientProvider client={queryClient}>
         <SCKeywordsTable
            domain={mockDomain}
            keywords={mockSCKeywords}
            isLoading={false}
            isConsoleIntegrated={true}
         />
      </QueryClientProvider>
   );

   it('marks tracked Search Console keywords as disabled and prevents selection', async () => {
      renderComponent();

      // Find the tracked keyword row
      const trackedKeywordElement = screen.getByText('tracked keyword').closest('.keyword');
      expect(trackedKeywordElement).toBeInTheDocument();

      // Find the checkbox button for the tracked keyword
      const trackedButton = trackedKeywordElement?.querySelector('button');
      expect(trackedButton).toBeInTheDocument();
      expect(trackedButton).toBeDisabled();
      expect(trackedButton).toHaveAttribute('aria-disabled', 'true');
      expect(trackedButton).toHaveAttribute('aria-label', 'Keyword already tracked');

      // Find the untracked keyword row
      const untrackedKeywordElement = screen.getByText('untracked keyword').closest('.keyword');
      expect(untrackedKeywordElement).toBeInTheDocument();

      // Find the checkbox button for the untracked keyword
      const untrackedButton = untrackedKeywordElement?.querySelector('button');
      expect(untrackedButton).toBeInTheDocument();
      expect(untrackedButton).toBeEnabled();
      expect(untrackedButton).not.toHaveAttribute('disabled');
      expect(untrackedButton).toHaveAttribute('aria-disabled', 'false');

      // Test that clicking the untracked keyword works
      fireEvent.click(untrackedButton as Element);
      await waitFor(() => {
         expect(screen.getByText('Add Keywords to Tracker')).toBeInTheDocument();
      });
   });

   it('selects only untracked keywords when using the header checkbox', async () => {
      const { container } = renderComponent();

      const headerButton = container.querySelector('.domKeywords_head button');
      expect(headerButton).toBeInTheDocument();

      fireEvent.click(headerButton as Element);

      await waitFor(() => {
         expect(screen.getByText('Add Keywords to Tracker')).toBeInTheDocument();
      });

      const trackedButton = screen.getByText('tracked keyword').closest('.keyword')?.querySelector('button');
      expect(trackedButton).toBeDisabled();
      expect(trackedButton).not.toHaveClass('bg-blue-700');

      const untrackedButton = screen.getByText('untracked keyword').closest('.keyword')?.querySelector('button');
      expect(untrackedButton).toBeEnabled();
      expect(untrackedButton).toHaveClass('bg-blue-700', 'border-blue-700', 'text-white');
   });
});
