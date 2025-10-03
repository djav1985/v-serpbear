/// <reference path="../../types.d.ts" />

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import KeywordIdeasTable from '../../components/ideas/KeywordIdeasTable';
import { useFetchKeywords } from '../../services/keywords';
import { useEmailKeywordIdeas } from '../../services/ideas';

const toastMock = jest.fn();

jest.mock('react-hot-toast', () => ({
   __esModule: true,
   default: (...args: unknown[]) => toastMock(...args),
}));

jest.mock('../../hooks/useIsMobile', () => jest.fn(() => [true]));
jest.mock('../../hooks/useWindowResize', () => jest.fn());

jest.mock('../../services/keywords', () => ({
   useAddKeywords: () => ({ mutate: jest.fn() }),
   useFetchKeywords: jest.fn(),
}));

jest.mock('../../services/adwords', () => ({
   useMutateFavKeywordIdeas: () => ({ mutate: jest.fn(), isLoading: false }),
}));

jest.mock('../../services/domains', () => ({
   fetchDomains: jest.fn().mockResolvedValue({ domains: [] }),
}));

jest.mock('../../services/ideas', () => ({
   useEmailKeywordIdeas: jest.fn(),
}));

jest.mock('react-chartjs-2', () => ({
   Line: () => null,
}));

const useFetchKeywordsMock = useFetchKeywords as jest.MockedFunction<typeof useFetchKeywords>;
const useEmailKeywordIdeasMock = useEmailKeywordIdeas as jest.MockedFunction<typeof useEmailKeywordIdeas>;

const mockRouter = {
   pathname: '/domain/ideas/example-domain',
   push: jest.fn(),
   query: { slug: 'example-domain' },
};

jest.mock('next/router', () => ({
   useRouter: () => mockRouter,
}));

describe('KeywordIdeasTable DRY Principle Implementation', () => {
   let queryClient: QueryClient;
   let emailMutateMock: jest.Mock;

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

   const renderTable = (keywords: IdeaKeyword[] = ideaKeywords, favorites: IdeaKeyword[] = []) => render(
         <QueryClientProvider client={queryClient}>
            <KeywordIdeasTable
               domain={domain}
               keywords={keywords}
               favorites={favorites}
               isLoading={false}
               noIdeasDatabase={false}
               isAdwordsIntegrated={true}
               showFavorites={false}
               setShowFavorites={jest.fn()}
            />
         </QueryClientProvider>,
      );

   beforeEach(() => {
      emailMutateMock = jest.fn();
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
      useEmailKeywordIdeasMock.mockReturnValue({ mutate: emailMutateMock, isLoading: false } as any);
      toastMock.mockClear();
      Object.assign(mockRouter, { pathname: '/domain/ideas/example-domain' });
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

      const emailButton = screen.getByRole('button', { name: 'Email Keywords' });
      expect(emailButton).toBeInTheDocument();

      fireEvent.click(emailButton);
      expect(emailMutateMock).toHaveBeenCalledWith({
         domain: 'example.com',
         keywords: [
            {
               keyword: 'new term',
               avgMonthlySearches: 50,
               monthlySearchVolumes: { '2024-01': '50' },
               competition: 'LOW',
               competitionIndex: 21,
            },
         ],
      });
      expect(toastMock).not.toHaveBeenCalled();
   });

   it('requires domain selection on the research page before triggering actions', async () => {
      mockRouter.pathname = '/research';
      renderTable();

      const untrackedRow = screen.getByText('new term').closest('div.keyword');
      expect(untrackedRow).toBeInTheDocument();

      const untrackedButton = within(untrackedRow as HTMLElement).getByRole('button', { name: /select keyword idea/i });
      fireEvent.click(untrackedButton);

      expect(await screen.findByText('Select Domain For Action')).toBeInTheDocument();

      const addButton = screen.getByRole('button', { name: '+ Add Keywords' });
      expect(addButton).toHaveAttribute('aria-disabled', 'true');

      const emailButton = screen.getByRole('button', { name: 'Email Keywords' });
      expect(emailButton).toHaveAttribute('aria-disabled', 'true');

      fireEvent.click(emailButton);
      expect(emailMutateMock).not.toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith('Please select a domain before emailing keywords.', { icon: '⚠️' });
   });

   it('renders duplicate keyword ideas with distinct rows', async () => {
      const duplicateKeywords: IdeaKeyword[] = [
         {
            ...ideaKeywords[0],
            uid: 'duplicate-1',
            keyword: 'duplicate term',
         },
         {
            ...ideaKeywords[0],
            uid: 'duplicate-2',
            keyword: 'duplicate term',
         },
      ];

      useFetchKeywordsMock.mockReturnValue({
         keywordsData: { keywords: [] },
         keywordsLoading: false,
      } as any);

      renderTable(duplicateKeywords);

      const keywordLabels = screen.getAllByText('duplicate term');
      expect(keywordLabels).toHaveLength(2);

      const firstRow = keywordLabels[0].closest('div.keyword');
      const secondRow = keywordLabels[1].closest('div.keyword');
      expect(firstRow).not.toBeNull();
      expect(secondRow).not.toBeNull();
      expect(firstRow).not.toBe(secondRow);

      const secondRowButton = within(secondRow as HTMLElement).getByRole('button', { name: /select keyword idea/i });
      fireEvent.click(secondRowButton);

      await waitFor(() => {
         expect(secondRow).toHaveClass('keyword--selected');
      });

      expect(firstRow).not.toHaveClass('keyword--selected');
   });
});
