/// <reference path="../../types.d.ts" />

import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DomainIdeasPage } from '../../pages/domain/ideas/[slug]';
import { useFetchDomains } from '../../services/domains';
import { useFetchKeywordIdeas } from '../../services/adwords';
import { useFetchSettings } from '../../services/settings';

jest.mock('next/router', () => ({
   useRouter: () => ({
      pathname: '/domain/ideas/[slug]',
      query: { slug: 'example-slug' },
      push: jest.fn(),
   }),
}));

jest.mock('../../services/domains');
jest.mock('../../services/adwords');
jest.mock('../../services/settings');

const KeywordIdeasTableMock = jest.fn(() => <div data-testid="ideas-table" />);
const KeywordIdeasUpdaterMock = jest.fn(() => <div data-testid="ideas-updater" />);

jest.mock('../../components/ideas/KeywordIdeasTable', () => (props: any) => KeywordIdeasTableMock(props));
jest.mock('../../components/ideas/KeywordIdeasUpdater', () => (props: any) => KeywordIdeasUpdaterMock(props));

const useFetchDomainsMock = useFetchDomains as jest.Mock;
const useFetchKeywordIdeasMock = useFetchKeywordIdeas as jest.Mock;
const useFetchSettingsMock = useFetchSettings as jest.Mock;

const baseDomain: DomainType = {
   ID: 1,
   domain: 'example.com',
   slug: 'example-slug',
   notification: true,
   notification_interval: 'daily',
   notification_emails: '',
   lastUpdated: '2024-01-01',
   added: '2024-01-01',
};

const renderPage = () => {
   const queryClient = new QueryClient({
      defaultOptions: {
         queries: { retry: false },
      },
   });

   return render(
      <QueryClientProvider client={queryClient}>
         <DomainIdeasPage />
      </QueryClientProvider>,
   );
};

describe('Domain ideas page credentials handling', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      useFetchKeywordIdeasMock.mockReturnValue({
         data: { data: { keywords: [], favorites: [], settings: undefined } },
         isLoading: false,
         isError: false,
      });
      useFetchDomainsMock.mockReturnValue({ data: { domains: [baseDomain] }, isLoading: false });
   });

   it('flags Ads integration as false when required credentials are missing', () => {
      useFetchSettingsMock.mockReturnValue({
         data: { settings: { adwords_refresh_token: 'token' } },
         isLoading: false,
      });

      renderPage();

      expect(KeywordIdeasTableMock).toHaveBeenCalledWith(expect.objectContaining({ isAdwordsIntegrated: false }));
   });

   it('combines domain Search Console credentials with global flag for the updater', async () => {
      useFetchSettingsMock.mockReturnValue({
         data: { settings: { search_console_integrated: false } },
         isLoading: false,
      });
      useFetchDomainsMock.mockReturnValue({
         data: {
            domains: [{
               ...baseDomain,
               search_console: JSON.stringify({ client_email: 'user@example.com', private_key: 'key' }),
            }],
         },
         isLoading: false,
      });

      renderPage();

      const loadButton = await screen.findByTestId('load_ideas');
      fireEvent.click(loadButton);

      expect(KeywordIdeasUpdaterMock).toHaveBeenCalledWith(expect.objectContaining({ searchConsoleConnected: true }));
   });
});
