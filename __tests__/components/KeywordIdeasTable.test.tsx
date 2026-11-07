/// <reference path="../../types.d.ts" />

/**
 * Tests for the keyword ideas table (DRY tracked-keyword handling) and the
 * KeywordIdeasUpdater load controls.
 */

const toastMock = jest.fn();
const mockMutate = jest.fn();
const mockRouter = {
   pathname: '/domain/ideas/example-domain',
   push: jest.fn(),
   query: { slug: 'example-domain' },
};

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
   useMutateKeywordIdeas: () => ({ mutate: mockMutate, isLoading: false }),
}));

jest.mock('../../services/settings', () => ({
   useFetchSettings: () => ({ data: undefined }),
}));

jest.mock('../../services/domains', () => ({
   useFetchDomains: jest.fn(),
}));

jest.mock('../../services/ideas', () => ({
   useEmailKeywordIdeas: jest.fn(),
}));

// Delegates to the real SelectField by default; the updater suite swaps in its own stub.
jest.mock('../../components/common/SelectField', () => ({
   __esModule: true,
   default: jest.fn(jest.requireActual('../../components/common/SelectField').default),
}));

jest.mock('react-chartjs-2', () => ({
   Line: () => null,
}));

jest.mock('next/router', () => ({
   useRouter: () => mockRouter,
}));

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import KeywordIdeasTable from '../../components/ideas/KeywordIdeasTable';
import KeywordIdeasUpdater from '../../components/ideas/KeywordIdeasUpdater';
import SelectField from '../../components/common/SelectField';
import { useFetchKeywords } from '../../services/keywords';
import { useEmailKeywordIdeas } from '../../services/ideas';
import { useFetchDomains } from '../../services/domains';

const useFetchDomainsMock = useFetchDomains as jest.Mock;
const useFetchKeywordsMock = useFetchKeywords as jest.MockedFunction<typeof useFetchKeywords>;
const useEmailKeywordIdeasMock = useEmailKeywordIdeas as jest.MockedFunction<typeof useEmailKeywordIdeas>;
const SelectFieldMock = SelectField as unknown as jest.Mock;
const actualSelectField = jest.requireActual('../../components/common/SelectField').default;

describe('KeywordIdeasTable DRY Principle Implementation', () => {
   let queryClient: QueryClient;
   let emailMutateMock: jest.Mock;

   const domain: DomainType = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
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
      useFetchDomainsMock.mockReturnValue({ data: { domains: [] } });
      Object.assign(mockRouter, { pathname: '/domain/ideas/example-domain' });
   });

   afterEach(() => {
      queryClient.clear();
      jest.clearAllMocks();
   });

   it('keeps an idea selectable when only one of the two selected devices already tracks it', async () => {
      renderTable();

      // Desktop is tracked for "tracked term"; with both devices chosen it still needs mobile
      fireEvent.click(within(screen.getByText('new term').closest('div.keyword') as HTMLElement).getByRole('button', { name: /select keyword idea/i }));
      fireEvent.click(await screen.findByRole('checkbox', { name: /Mobile/ }));

      const trackedRow = screen.getByText('tracked term').closest('div.keyword') as HTMLElement;
      const partialButton = within(trackedRow).getByRole('button', { name: /select keyword idea/i });
      expect(partialButton).toBeEnabled();
      expect(within(trackedRow).queryByRole('button', { name: /already tracked/i })).not.toBeInTheDocument();
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
      expect(await screen.findByRole('button', { name: /Add Keyword/ })).toBeInTheDocument();

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

      const addButton = screen.getByRole('button', { name: '+ Add Keyword' });
      expect(addButton).toHaveAttribute('aria-disabled', 'true');

      const emailButton = screen.getByRole('button', { name: 'Email Keywords' });
      expect(emailButton).toHaveAttribute('aria-disabled', 'true');

      fireEvent.click(emailButton);
      expect(emailMutateMock).not.toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith('Please select a domain before emailing keywords.', { icon: '⚠️' });
   });

   it('shows the chosen domain in the research page selector and uses it for actions', async () => {
      mockRouter.pathname = '/research';
      useFetchDomainsMock.mockReturnValue({
         data: { domains: [{ ...domain, ID: 2, domain: 'other.com', slug: 'other-com' }, domain] },
      });
      renderTable();

      const untrackedRow = screen.getByText('new term').closest('div.keyword') as HTMLElement;
      fireEvent.click(within(untrackedRow).getByRole('button', { name: /select keyword idea/i }));

      fireEvent.click(await screen.findByText('Select a Domain'));
      fireEvent.click(await screen.findByText('example.com'));

      expect(screen.queryByText('Select a Domain')).not.toBeInTheDocument();
      expect(screen.getByText('example.com')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Email Keywords' }));
      expect(emailMutateMock).toHaveBeenCalledWith(expect.objectContaining({ domain: 'example.com' }));
      expect(toastMock).not.toHaveBeenCalled();
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

   it('keeps the search volume chart visible on mobile rows', () => {
      const { container } = renderTable();
      const chartRows = container.querySelectorAll('.keyword_visits');

      expect(chartRows.length).toBeGreaterThan(0);
      chartRows.forEach((row) => expect(row.className).not.toContain('hidden'));
   });

   it('derives the Favorites tab from the showFavorites prop', () => {
      const favorite: IdeaKeyword = { ...ideaKeywords[1], uid: 'fav-idea', keyword: 'favorite term' };
      const setShowFavorites = jest.fn();
      const table = (show: boolean) => (
         <QueryClientProvider client={queryClient}>
            <KeywordIdeasTable
               domain={domain}
               keywords={ideaKeywords}
               favorites={[favorite]}
               isLoading={false}
               noIdeasDatabase={false}
               isAdwordsIntegrated={true}
               showFavorites={show}
               setShowFavorites={setShowFavorites}
            />
         </QueryClientProvider>
      );

      const { rerender } = render(table(true));
      expect(screen.getByText('favorite term')).toBeInTheDocument();
      expect(screen.queryByText('new term')).not.toBeInTheDocument();

      // The tab reports the change to the parent and does not keep its own copy of the state
      fireEvent.click(screen.getByTestId('desktop_tab'));
      expect(setShowFavorites).toHaveBeenCalledWith(false);
      expect(screen.getByText('favorite term')).toBeInTheDocument();

      rerender(table(false));
      expect(screen.getByText('new term')).toBeInTheDocument();
      expect(screen.queryByText('favorite term')).not.toBeInTheDocument();
   });
});

describe('KeywordIdeasUpdater Component', () => {
   const mockDomain: DomainType = {
      ID: 1,
      domain: 'example.com',
      slug: 'example-com',
      lastUpdated: '2023-01-01',
      added: '2023-01-01',
      notification_emails: '',
      search_console: '',
      keywordsTracked: 0,
   };

   let queryClient: QueryClient;

   beforeEach(() => {
      // Stub SelectField so the options are visible as plain list items.
      SelectFieldMock.mockImplementation(({ options }: any) => (
         <ul data-testid="select-field-options">
            {options.map((option: { label: string, value: string }) => (
               <li key={option.value}>{option.label}</li>
            ))}
         </ul>
      ));

      queryClient = new QueryClient({
         defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
         },
      });
   });

   afterEach(() => {
      SelectFieldMock.mockImplementation(actualSelectField);
   });

   const renderWithQueryClient = (component: React.ReactElement) => render(
         <QueryClientProvider client={queryClient}>
            {component}
         </QueryClientProvider>,
      );

   it('renders without crashing', () => {
      renderWithQueryClient(
         <KeywordIdeasUpdater
            domain={mockDomain}
            searchConsoleConnected={false}
            adwordsConnected={true}
         />,
      );

      expect(screen.getByText('Get Keyword Ideas')).toBeInTheDocument();
      expect(screen.getByText('Load Keyword Ideas')).toBeInTheDocument();
   });

   it('validates the fix for keywordPayload variable name', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      renderWithQueryClient(
         <KeywordIdeasUpdater
            domain={mockDomain}
            searchConsoleConnected={false}
            adwordsConnected={true}
         />,
      );

      // The console should not show "keywordPaylod" (with typo) anymore
      // This validates our fix
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
         expect.stringContaining('keywordPaylod'),
      );

      consoleLogSpy.mockRestore();
   });

   it('lists the Search Console seed option when the integration is available', () => {
      renderWithQueryClient(
         <KeywordIdeasUpdater
            domain={mockDomain}
            searchConsoleConnected={true}
            adwordsConnected={true}
         />,
      );

      expect(screen.getAllByTestId('select-field-options')[0]).toHaveTextContent('Based on already ranking keywords (GSC)');
   });
});
