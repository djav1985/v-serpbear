/// <reference path="../../types.d.ts" />

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { DomainIdeasPage } from '../../pages/domain/ideas/[slug]';
import { useFetchDomains } from '../../services/domains';
import { useFetchKeywordIdeas } from '../../services/adwords';
import { useFetchSettings } from '../../services/settings';
import { useBranding } from '../../hooks/useBranding';
import { useFetchKeywords } from '../../services/keywords';

jest.mock('next/router', () => ({
   useRouter: () => ({
      pathname: '/domain/ideas/[slug]',
      query: { slug: 'example-slug' },
      push: jest.fn(),
   }),
}));

jest.mock('../../services/domains', () => ({
   __esModule: true,
   ADWORDS_ENABLED: true,
   useFetchDomains: jest.fn(),
}));
jest.mock('../../services/adwords');
jest.mock('../../services/settings');
jest.mock('../../hooks/useBranding', () => ({
   useBranding: jest.fn(),
}));
jest.mock('../../services/keywords', () => ({
   useFetchKeywords: jest.fn(),
   useRefreshKeywords: () => ({ mutate: jest.fn(), isLoading: false }),
}));

const KeywordIdeasTableMock = jest.fn(() => <div data-testid="ideas-table" />);
const KeywordIdeasUpdaterMock = jest.fn(() => <div data-testid="ideas-updater" />);

jest.mock('next/dynamic', () => () => (props: any) => <KeywordIdeasTableMock {...props} />);
jest.mock('../../components/ideas/KeywordIdeasTable', () => (props: any) => KeywordIdeasTableMock(props));
jest.mock('../../components/ideas/KeywordIdeasUpdater', () => (props: any) => KeywordIdeasUpdaterMock(props));

const useFetchDomainsMock = useFetchDomains as jest.Mock;
const useFetchKeywordIdeasMock = useFetchKeywordIdeas as jest.Mock;
const useFetchSettingsMock = useFetchSettings as jest.Mock;
const useFetchKeywordsMock = useFetchKeywords as jest.Mock;
const useBrandingMock = useBranding as jest.Mock;

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
      useFetchKeywordsMock.mockReturnValue({ keywordsData: { keywords: [] }, keywordsLoading: false });
      useBrandingMock.mockReturnValue({
         branding: { platformName: 'SerpBear' },
         isLoading: false,
         isError: false,
         isFetching: false,
         refetch: jest.fn(),
      });
    });

   it('flags Ads integration as false when required credentials are missing', () => {
      useFetchSettingsMock.mockReturnValue({
         data: { settings: { adwords_refresh_token: 'token' } },
         isLoading: false,
      });

      renderPage();

       expect(KeywordIdeasTableMock).toHaveBeenCalledWith(
          expect.objectContaining({ isAdwordsIntegrated: false }),
          {},
       );
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

      expect(loadButton).toBeInTheDocument();
    });
});
