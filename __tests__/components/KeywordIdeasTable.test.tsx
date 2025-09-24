/// <reference path="../../app/types.d.ts" />

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import KeywordIdeasTable from '../../app/components/ideas/KeywordIdeasTable';
import { useFetchKeywords } from '../../app/services/keywords';

jest.mock('next/router', () => ({
   useRouter: () => ({
      pathname: '/domain/ideas/example-domain',
      push: jest.fn(),
      query: { slug: 'example-domain' },
   }),
}));

jest.mock('../../app/hooks/useIsMobile', () => jest.fn(() => [true]));
jest.mock('../../app/hooks/useWindowResize', () => jest.fn());

jest.mock('../../app/services/keywords', () => ({
   useAddKeywords: () => ({ mutate: jest.fn() }),
   useFetchKeywords: jest.fn(),
}));

jest.mock('../../app/services/adwords', () => ({
   useMutateFavKeywordIdeas: () => ({ mutate: jest.fn(), isLoading: false }),
}));

jest.mock('../../app/services/domains', () => ({
   fetchDomains: jest.fn().mockResolvedValue({ domains: [] }),
}));

jest.mock('react-chartjs-2', () => ({
   Line: () => null,
}));

const useFetchKeywordsMock = useFetchKeywords as jest.MockedFunction<typeof useFetchKeywords>;

describe('KeywordIdeasTable DRY Principle Implementation', () => {
   let queryClient: QueryClient;

   const domain: DomainType = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
      notification: true,
      notification_interval: 'daily',
      notification_emails: '',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
   };

   const ideaKeywords: IdeaKeyword[] = [
      {
         uid: 'tracked-idea',
         keyword: 'tracked term',
         competition: 'MEDIUM',
         country: 'US',
         domain: 'example.com',
         competitionIndex: 42,
         monthlySearchVolumes: { '2024-01': '100' },
         avgMonthlySearches: 100,
         added: Date.now(),
         updated: Date.now(),
         position: 0,
      },
      {
         uid: 'new-idea',
         keyword: 'new term',
         competition: 'LOW',
         country: 'US',
         domain: 'example.com',
         competitionIndex: 21,
         monthlySearchVolumes: { '2024-01': '50' },
         avgMonthlySearches: 50,
         added: Date.now(),
         updated: Date.now(),
         position: 0,
      },
   ];

   const trackedKeywords: KeywordType[] = [
      {
         ID: 10,
         keyword: 'tracked term',
         device: 'desktop',
         country: 'US',
         domain: 'example.com',
         lastUpdated: '2024-01-01T00:00:00.000Z',
         added: '2024-01-01T00:00:00.000Z',
         position: 5,
         volume: 100,
         sticky: false,
         history: {},
         lastResult: [],
         url: 'https://example.com',
         tags: [],
         updating: false,
         lastUpdateError: false,
      },
   ];

   const renderTable = () => render(
         <QueryClientProvider client={queryClient}>
            <KeywordIdeasTable
               domain={domain}
               keywords={ideaKeywords}
               favorites={[]}
               isLoading={false}
               noIdeasDatabase={false}
               isAdwordsIntegrated={true}
               showFavorites={false}
               setShowFavorites={jest.fn()}
            />
         </QueryClientProvider>,
      );

   beforeEach(() => {
      queryClient = new QueryClient({
         defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
         },
      });

      useFetchKeywordsMock.mockReturnValue({
         keywordsData: { keywords: trackedKeywords },
         keywordsLoading: false,
      } as any);
   });

   afterEach(() => {
      queryClient.clear();
      jest.clearAllMocks();
   });

   it('marks tracked keyword ideas as disabled and prevents selection', async () => {
      renderTable();

      const trackedRow = screen.getByText('tracked term').closest('div.keyword');
      expect(trackedRow).toBeInTheDocument();

      const trackedButton = within(trackedRow as HTMLElement).getByRole('button', { name: /already tracked/i });
      expect(trackedButton).toBeDisabled();
      expect(trackedButton).toHaveAttribute('aria-disabled', 'true');

      fireEvent.click(trackedButton);
      await waitFor(() => {
         expect(screen.queryByText('Add Keywords to Tracker')).not.toBeInTheDocument();
      });
      expect(trackedRow).not.toHaveClass('keyword--selected');

      const untrackedRow = screen.getByText('new term').closest('div.keyword');
      expect(untrackedRow).toBeInTheDocument();

      const untrackedButton = within(untrackedRow as HTMLElement).getByRole('button', { name: /select keyword idea/i });
      expect(untrackedButton).toBeEnabled();

      fireEvent.click(untrackedButton);
      await waitFor(() => {
         expect(untrackedRow).toHaveClass('keyword--selected');
      });
      expect(await screen.findByText('Add Keywords to Tracker')).toBeInTheDocument();
   });
});
