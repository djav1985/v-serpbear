/// <reference path="../../types.d.ts" />

/**
 * Tests for the Search Console keywords table and the SCKeyword row component.
 */

jest.mock('next/router', () => ({
   useRouter: () => ({
      push: jest.fn(),
      pathname: '/domain/console/test-domain',
      query: { slug: 'test-domain' },
   }),
}));

jest.mock('../../services/keywords', () => ({
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

jest.mock('../../hooks/useIsMobile', () => () => [false]);
jest.mock('../../hooks/useWindowResize', () => () => {});

// Mock filter and sort functions
jest.mock('../../utils/client/sortFilter', () => ({
   SCfilterKeywords: (keywords: any[]) => keywords,
   SCsortKeywords: (keywords: any[]) => keywords,
   SCkeywordsByDevice: (keywords: any[], device: string) => ({ [device]: keywords }),
}));

// Mock Icon component
jest.mock('../../components/common/Icon', () => {
   const MockIcon = ({ type, title }: { type: string; title?: string }) => (
      <span data-testid={`icon-${type}`} title={title}>✓</span>
   );
   MockIcon.displayName = 'MockIcon';
   return MockIcon;
});

// Mock KeywordFilters component
jest.mock('../../components/keywords/KeywordFilter', () => {
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

// Mock countries data (keeps the real exports, pins US for the row tests)
jest.mock('../../utils/countries', () => {
   const actual = jest.requireActual('../../utils/countries');
   return {
      __esModule: true,
      ...actual,
      default: { ...actual.default, US: ['United States', 'us'] },
   };
});

// Mock KeywordPosition component
jest.mock('../../components/keywords/KeywordPosition', () =>
   function KeywordPosition({ position }: { position: number }) {
      return <span data-testid="position">{position}</span>;
   }
);

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import SCKeywordsTable from '../../components/keywords/SCKeywordsTable';
import SCKeyword from '../../components/keywords/SCKeyword';

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
      notification_emails: '',
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
         page: '/',
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
         page: '/',
      },
   ];

   const renderComponent = (keywords = mockSCKeywords) => render(
      <QueryClientProvider client={queryClient}>
         <SCKeywordsTable
            domain={mockDomain}
            keywords={keywords}
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
         expect(screen.getByRole('button', { name: /Add Keyword/ })).toBeInTheDocument();
      });
   });

   it('selects only untracked keywords when using the header checkbox', async () => {
      const { container } = renderComponent();

      const headerButton = container.querySelector('.domKeywords_head button');
      expect(headerButton).toBeInTheDocument();

      fireEvent.click(headerButton as Element);

      await waitFor(() => {
         expect(screen.getByRole('button', { name: /Add Keyword/ })).toBeInTheDocument();
      });

      const trackedButton = screen.getByText('tracked keyword').closest('.keyword')?.querySelector('button');
      expect(trackedButton).toBeDisabled();
      expect(trackedButton).not.toHaveClass('bg-blue-700');

      const untrackedButton = screen.getByText('untracked keyword').closest('.keyword')?.querySelector('button');
      expect(untrackedButton).toBeEnabled();
      expect(untrackedButton).toHaveClass('bg-blue-700', 'border-blue-700', 'text-white');
   });

   it('displays zeroed summary metrics when no keywords are available', () => {
      renderComponent([]);

      const summaryRow = screen.getByText('0 desktop Keywords').closest('.domKeywords_head');
      expect(summaryRow).toBeInTheDocument();
      expect(summaryRow).toHaveTextContent('0 desktop Keywords');
      expect(summaryRow).toHaveTextContent('0');
      expect(summaryRow).toHaveTextContent('0.00%');
   });

   it('weights the summary position by impressions and computes CTR from total clicks and impressions', () => {
      renderComponent([
         { ...mockSCKeywords[0], uid: 'w-1', keyword: 'high volume', position: 10, impressions: 100, clicks: 10, ctr: 10 },
         { ...mockSCKeywords[0], uid: 'w-2', keyword: 'low volume', position: 2, impressions: 900, clicks: 0, ctr: 0 },
      ]);

      const summaryRow = screen.getByText('2 desktop Keywords').closest('.domKeywords_head') as HTMLElement;
      // Impression-weighted position is (10*100 + 2*900) / 1000 = 2.8, which rounds to 3. A plain average would be 6.
      expect(summaryRow.querySelector('.domKeywords_head_position')).toHaveTextContent(/^3$/);
      // Total clicks / total impressions = 10 / 1000 = 1%. An average of per-row CTRs would be 5%.
      expect(summaryRow.querySelector('.domKeywords_head_ctr')).toHaveTextContent('1.00%');
   });
});

describe('SCKeyword Component', () => {
   const mockSelectKeyword = jest.fn();

   const defaultKeywordData: SearchAnalyticsItem = {
      uid: 'test-uid',
      keyword: 'test keyword',
      position: 5,
      country: 'US',
      impressions: 1000,
      ctr: 0.05,
      clicks: 50,
      device: 'desktop',
      page: '/test',
   };

   const defaultProps = {
      keywordData: defaultKeywordData,
      selected: false,
      selectKeyword: mockSelectKeyword,
      isTracked: false,
      style: {},
   };

   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('sets disabled state and aria-label for untracked, tracked and selected keywords', () => {
      const cases = [
         { props: {}, disabled: false, label: 'Select keyword' },
         { props: { isTracked: true }, disabled: true, label: 'Keyword already tracked' },
         { props: { selected: true }, disabled: false, label: 'Deselect keyword' },
      ];
      for (const { props, disabled, label } of cases) {
         const { unmount } = render(<SCKeyword {...defaultProps} {...props} />);

         const button = screen.getByRole('button');
         expect(button.hasAttribute('disabled')).toBe(disabled);
         expect(button).toHaveAttribute('aria-disabled', String(disabled));
         expect(button).toHaveAttribute('aria-label', label);
         unmount();
      }
   });

   it('calls selectKeyword only when the keyword is not tracked', () => {
      const cases = [
         { isTracked: false, called: true },
         { isTracked: true, called: false },
      ];
      for (const { isTracked, called } of cases) {
         mockSelectKeyword.mockClear();
         const { unmount } = render(<SCKeyword {...defaultProps} isTracked={isTracked} />);

         fireEvent.click(screen.getByRole('button'));
         expect(mockSelectKeyword.mock.calls).toEqual(called ? [['test-uid', false]] : []);
         unmount();
      }
   });

   it('applies correct styling for tracked keywords', () => {
      render(<SCKeyword {...defaultProps} isTracked={true} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-400', 'border-gray-400', 'cursor-not-allowed', 'opacity-80');
   });

   it('applies correct styling for selected keywords', () => {
      render(<SCKeyword {...defaultProps} selected={true} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-700', 'border-blue-700', 'text-white');
   });

   it('shows the "Already in Tracker" title only when tracked', () => {
      const cases = [
         { isTracked: true, title: 'Already in Tracker' },
         { isTracked: false, title: '' },
      ];
      for (const { isTracked, title } of cases) {
         const { unmount } = render(<SCKeyword {...defaultProps} isTracked={isTracked} />);

         expect(screen.getByTestId('icon-check')).toHaveAttribute('title', title);
         unmount();
      }
   });
});
