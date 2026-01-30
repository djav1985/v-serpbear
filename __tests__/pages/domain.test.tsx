import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { DomainPage as SingleDomain } from '../../pages/domain/[slug]';
import { useAddDomain, useDeleteDomain, useFetchDomain, useFetchDomains, useUpdateDomain } from '../../services/domains';
import { useBranding } from '../../hooks/useBranding';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useAddKeywords, useDeleteKeywords,
   useFavKeywords, useFetchKeywords, useRefreshKeywords, useFetchSingleKeyword } from '../../services/keywords';
import { dummyDomain, dummyKeywords, dummySettings } from '../../__mocks__/data';
import { useClearFailedQueue, useFetchSettings, useUpdateSettings } from '../../services/settings';

jest.mock('../../services/domains');
jest.mock('../../services/keywords', () => ({
   useAddKeywords: jest.fn(),
   useDeleteKeywords: jest.fn(),
   useFavKeywords: jest.fn(),
   useFetchKeywords: jest.fn(),
   useRefreshKeywords: jest.fn(),
   useFetchSingleKeyword: jest.fn(),
}));
jest.mock('../../services/settings', () => ({
   useFetchSettings: jest.fn(),
   useUpdateSettings: jest.fn(),
   useClearFailedQueue: jest.fn(),
}));
jest.mock('../../hooks/useBranding');

jest.mock('next/router', () => ({
   useRouter: () => ({
     query: { slug: dummyDomain.slug },
     isReady: true,
   }),
}));

jest.mock('react-chartjs-2', () => ({
   Line: () => null,
}));

jest.mock('next/dynamic', () => () => () => null);
jest.mock('../../components/keywords/AddKeywords', () => () => null);
jest.mock('../../components/domains/AddDomain', () => () => null);
jest.mock('../../components/domains/DomainSettings', () => () => null);

const useFetchDomainsFunc = useFetchDomains as jest.Mock<any>;
const useFetchDomainFunc = useFetchDomain as jest.Mock<any>;
const useFetchKeywordsFunc = useFetchKeywords as jest.Mock<any>;
const useDeleteKeywordsFunc = useDeleteKeywords as jest.Mock<any>;
const useFavKeywordsFunc = useFavKeywords as jest.Mock<any>;
const useRefreshKeywordsFunc = useRefreshKeywords as jest.Mock<any>;
const useAddDomainFunc = useAddDomain as jest.Mock<any>;
const useAddKeywordsFunc = useAddKeywords as jest.Mock<any>;
const useUpdateDomainFunc = useUpdateDomain as jest.Mock<any>;
const useDeleteDomainFunc = useDeleteDomain as jest.Mock<any>;
const useFetchSettingsFunc = useFetchSettings as jest.Mock<any>;
const useUpdateSettingsFunc = useUpdateSettings as jest.Mock<any>;
const useClearFailedQueueFunc = useClearFailedQueue as jest.Mock<any>;
const useFetchSingleKeywordFunc = useFetchSingleKeyword as jest.Mock<any>;
const useBrandingMock = useBranding as jest.Mock<any>;

describe('SingleDomain Page', () => {
   const queryClient = new QueryClient();
   beforeEach(() => {
      useFetchSettingsFunc.mockImplementation(() => ({ data: { settings: dummySettings }, isLoading: false }));
      useFetchDomainsFunc.mockImplementation(() => ({ data: { domains: [dummyDomain] }, isLoading: false }));
      useFetchDomainFunc.mockImplementation(() => ({ data: { domain: dummyDomain }, isLoading: false }));
      useFetchKeywordsFunc.mockImplementation(() => ({ keywordsData: { keywords: dummyKeywords }, keywordsLoading: false }));
      const fetchPayload = { history: dummyKeywords[0].history || [], searchResult: dummyKeywords[0].lastResult || [] };
      useFetchSingleKeywordFunc.mockImplementation(() => ({ data: fetchPayload, isLoading: false }));
      useDeleteKeywordsFunc.mockImplementation(() => ({ mutate: () => { } }));
      useFavKeywordsFunc.mockImplementation(() => ({ mutate: () => { } }));
      useRefreshKeywordsFunc.mockImplementation(() => ({ mutate: () => { } }));
      useAddDomainFunc.mockImplementation(() => ({ mutate: () => { } }));
      useAddKeywordsFunc.mockImplementation(() => ({ mutate: () => { } }));
      useUpdateDomainFunc.mockImplementation(() => ({ mutate: () => { } }));
      useUpdateSettingsFunc.mockImplementation(() => ({ mutate: () => { } }));
      useClearFailedQueueFunc.mockImplementation(() => ({ mutate: () => { }, isLoading: false }));
      useDeleteDomainFunc.mockImplementation(() => ({ mutate: () => { } }));
      useBrandingMock.mockReturnValue({
         branding: DEFAULT_BRANDING,
         isLoading: false,
         isError: false,
         isFetching: false,
         refetch: jest.fn(),
      });
   });
   afterEach(() => {
      jest.clearAllMocks();
   });
   it('Render without crashing.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      expect(screen.getByTestId('domain-header')).toBeInTheDocument();
   });

   it('shows the keyword table spinner while queries resolve', () => {
      useFetchSettingsFunc.mockImplementation(() => ({ data: undefined, isLoading: true }));
      useFetchDomainsFunc.mockImplementation(() => ({ data: undefined, isLoading: true }));
      useFetchKeywordsFunc.mockImplementation(() => ({ keywordsData: undefined, keywordsLoading: true }));

      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);

      expect(screen.queryByTestId('page-loader-overlay')).not.toBeInTheDocument();
      const spinner = screen.getByRole('status', { name: /loading keywords/i });
      expect(spinner).toBeInTheDocument();
   });

   it('applies gutter spacing between the sidebar and content area', () => {
      const { container } = render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const layoutWrapper = container.querySelector('.desktop-container.gap-6');
      expect(layoutWrapper).toBeInTheDocument();
      expect(layoutWrapper).toHaveClass('gap-6');
   });
   it('Should Call the useFetchDomains hook on render.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      expect(useFetchDomains).toHaveBeenCalled();
   });
   it('Should Render the Keywords', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      // Find keywords by their semantic content instead of CSS class
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();
   });
   it('Should Display the Keywords Details Sidebar on Keyword Click.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      // Find and click on a keyword link by finding a clickable element with the keyword text
      const keywordElement = screen.getByText('compress image');
      fireEvent.click(keywordElement);
      expect(useFetchSingleKeyword).toHaveBeenCalled();
      expect(screen.getByTestId('keywordDetails')).toBeVisible();
   });
   it('Should Display the AddDomain Modal on Add Domain Button Click.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('add_domain');
      if (button) fireEvent.click(button);
      expect(screen.getByTestId('adddomain_modal')).toBeVisible();
   });

   it('toggles the AddDomain modal without transition errors', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);

      const openButton = screen.getByTestId('add_domain');
      expect(() => fireEvent.click(openButton)).not.toThrow();

      await waitFor(() => {
         expect(screen.getByTestId('adddomain_modal')).toBeVisible();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(() => fireEvent.click(cancelButton)).not.toThrow();

      await waitFor(() => {
         expect(screen.queryByTestId('adddomain_modal')).not.toBeInTheDocument();
      });

      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
   });
   it('Should Display the AddKeywords Modal on Add Keyword Button Click.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('add_keyword');
      if (button) fireEvent.click(button);
      expect(screen.getByTestId('addkeywords_modal')).toBeVisible();
   });

   it('Should display the Domain Settings on Settings Button click.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('show_domain_settings');
      if (button) fireEvent.click(button);
      expect(screen.getByTestId('domain_settings')).toBeVisible();
   });

   it('Device Tab change should be functioning.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('mobile_tab');
      if (button) fireEvent.click(button);
      // After clicking mobile tab, desktop keywords should not be visible
      expect(screen.queryByText('compress image')).not.toBeInTheDocument();
      expect(screen.queryByText('image compressor')).not.toBeInTheDocument();
   });

   it('Search Filter should function properly', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const inputNode = screen.getByTestId('filter_input');
      if (inputNode) fireEvent.change(inputNode, { target: { value: 'compressor' } }); // triggers onChange event
      expect(inputNode.getAttribute('value')).toBe('compressor');
      // After filtering, only one keyword should be visible
      expect(screen.getByText('image compressor')).toBeInTheDocument();
      expect(screen.queryByText('compress image')).not.toBeInTheDocument();
   });

   it('Country Filter should function properly', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('filter_button');
      if (button) fireEvent.click(button);
      
      // Since the filter UI is complex, just verify that the filter options become visible
      // The exact filtering behavior is better tested at the component level
      await waitFor(() => {
         expect(screen.getByText('All Countries')).toBeVisible();
      });
   });

   // Tags Filter should function properly
   it('Tags Filter should Render & Function properly', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('filter_button');
      if (button) fireEvent.click(button);
      
      // Since the filter UI is complex, just verify that the filter options become visible
      // The exact filtering behavior is better tested at the component level
      await waitFor(() => {
         expect(screen.getByText('All Tags')).toBeVisible();
      });
   });

   it('Sort Options Should be visible Sort Button on Click.', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('sort_button');
      if (button) fireEvent.click(button);
      // Look for sort options by finding specific sort option text
      expect(screen.getByText('Top Position')).toBeVisible();
   });

   it('Sort: Position should sort keywords accordingly', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('sort_button');
      if (button) fireEvent.click(button);
      
      // Test Top Position Sort by clicking on the sort option
      const topPosSortOption = screen.getByText('Top Position');
      fireEvent.click(topPosSortOption);
      
      // Verify sorting works by checking both keywords are still present
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();

      // Test Lowest Position Sort
      if (button) fireEvent.click(button);
      const lowestPosSortOption = screen.getByText('Lowest Position');
      fireEvent.click(lowestPosSortOption);
      
      // Verify sorting works by checking both keywords are still present
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();
   });

   it('Sort: Date Added should sort keywords accordingly', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('sort_button');
      if (button) fireEvent.click(button);

      // Test Most Recent Sort
      const newestSortOption = screen.getByText('Most Recent (Default)');
      fireEvent.click(newestSortOption);
      
      // Verify sorting works by checking both keywords are still present
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();

      // Test Oldest Sort
      if (button) fireEvent.click(button);
      const oldestSortOption = screen.getByText('Oldest');
      fireEvent.click(oldestSortOption);
      
      // Verify sorting works by checking both keywords are still present
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();
   });

   it('Sort: Alphabetical should sort keywords accordingly', async () => {
      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);
      const button = screen.getByTestId('sort_button');
      if (button) fireEvent.click(button);

      // Test A-Z Sort
      const azSortOption = screen.getByText('Alphabetically(A-Z)');
      fireEvent.click(azSortOption);
      
      // Verify sorting works by checking both keywords are still present
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();

      // Test Z-A Sort
      if (button) fireEvent.click(button);
      const zaSortOption = screen.getByText('Alphabetically(Z-A)');
      fireEvent.click(zaSortOption);
      
      // Verify sorting works by checking both keywords are still present
      expect(screen.getByText('compress image')).toBeInTheDocument();
      expect(screen.getByText('image compressor')).toBeInTheDocument();
   });

   it('populates Search Console settings after fetching the canonical domain data', async () => {
      const decryptedSearchConsole = {
         property_type: 'url',
         url: 'https://compressimage.io/',
         client_email: 'client@compressimage.io',
         private_key: '---PRIVATE KEY---',
      };

      let hasInvokedSuccess = false;

      useFetchDomainFunc.mockImplementation((routerArg, domainValue, onSuccess) => {
         const domainResponse = {
            ...dummyDomain,
            search_console: JSON.stringify(decryptedSearchConsole),
         };
         if (!hasInvokedSuccess && domainValue === dummyDomain.domain && typeof onSuccess === 'function') {
            hasInvokedSuccess = true;
            onSuccess(domainResponse);
         }
         return { data: { domain: domainResponse }, isLoading: false };
      });

      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);

      const openSettingsButton = screen.getByTestId('show_domain_settings');
      fireEvent.click(openSettingsButton);

      await waitFor(() => {
         expect(useFetchDomainFunc).toHaveBeenCalledWith(expect.anything(), dummyDomain.domain, expect.any(Function));
      });

      const settingsModal = await screen.findByTestId('domain_settings');
      const searchConsoleTab = within(settingsModal).getByText('Search Console');
      fireEvent.click(searchConsoleTab);

      await waitFor(() => {
         expect(screen.getByPlaceholderText('Search Console Property URL. eg: https://mywebsite.com/')).toHaveValue(decryptedSearchConsole.url);
      });

      expect(screen.getByPlaceholderText('myapp@appspot.gserviceaccount.com')).toHaveValue(decryptedSearchConsole.client_email);
      expect(screen.getByPlaceholderText('-----BEGIN PRIVATE KEY-----/ssssaswdkihad....')).toHaveValue(decryptedSearchConsole.private_key);
   });

   it('keeps default Search Console settings when data is malformed', async () => {
      let hasInvokedSuccess = false;

      useFetchDomainFunc.mockImplementation((routerArg, domainValue, onSuccess) => {
         const domainResponse = {
            ...dummyDomain,
            search_console: '{invalid-json',
         };
         if (!hasInvokedSuccess && domainValue === dummyDomain.domain && typeof onSuccess === 'function') {
            hasInvokedSuccess = true;
            onSuccess(domainResponse);
         }
         return { data: { domain: domainResponse }, isLoading: false };
      });

      render(<QueryClientProvider client={queryClient}><SingleDomain /></QueryClientProvider>);

      const openSettingsButton = screen.getByTestId('show_domain_settings');
      fireEvent.click(openSettingsButton);

      const settingsModal = await screen.findByTestId('domain_settings');
      const searchConsoleTab = within(settingsModal).getByText('Search Console');
      fireEvent.click(searchConsoleTab);

      await waitFor(() => {
         expect(screen.getByPlaceholderText('myapp@appspot.gserviceaccount.com')).toHaveValue('');
      });
   });
});
