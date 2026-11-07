/// <reference path="../../types.d.ts" />

/**
 * Page render behavior tests: Home redirect, Login page, Domain ideas page,
 * Research page and _app server-side branding.
 */

const routerPush = jest.fn();
const routerReplace = jest.fn();
const mockRouter = {
   push: routerPush,
   replace: routerReplace,
   pathname: '/research',
   query: {} as Record<string, string>,
};

// Pages are wrapped in withAuth; these render tests cover page content, not the auth gate.
jest.mock('../../hooks/useAuth', () => ({
   ...jest.requireActual('../../hooks/useAuth'),
   withAuth: (Component: any) => Component,
}));

jest.mock('next/router', () => ({
   useRouter: () => mockRouter,
}));

jest.mock('../../hooks/useBranding', () => ({
   useBranding: () => ({ branding: { platformName: 'SerpBear' } }),
}));

jest.mock('../../components/common/Branding', () => ({
   BrandTitle: () => null,
}));

jest.mock('../../utils/client/apiClient', () => {
   const actual = jest.requireActual('../../utils/client/apiClient');
   return { ...actual, apiPost: jest.fn() };
});

jest.mock('../../services/adwords', () => ({
   useFetchKeywordIdeas: jest.fn(),
   useMutateKeywordIdeas: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('../../services/settings');
jest.mock('../../services/domains');

const KeywordIdeasTableMock = jest.fn((_props?: any) => <div data-testid="ideas-table" />);
const KeywordIdeasUpdaterMock = jest.fn((_props?: any) => <div data-testid="ideas-updater" />);

jest.mock('../../components/ideas/KeywordIdeasTable', () => (props: any) => KeywordIdeasTableMock(props));
jest.mock('../../components/ideas/KeywordIdeasUpdater', () => (props: any) => KeywordIdeasUpdaterMock(props));

jest.mock('../../utils/branding', () => ({
   ...jest.requireActual('../../utils/branding'),
   getBranding: jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import type { AppContext } from 'next/app';
import Home from '../../pages/index';
import ResearchPage from '../../pages/research';
import MyApp from '../../pages/_app';
import Login from '../../pages/login';
import { DomainIdeasPage } from '../../pages/domain/ideas/[slug]';
import { AUTH_QUERY_KEY } from '../../hooks/useAuth';
import { apiPost } from '../../utils/client/apiClient';
import { useAddDomain, useFetchDomains } from '../../services/domains';
import { useFetchKeywordIdeas } from '../../services/adwords';
import { useFetchSettings } from '../../services/settings';
import { getBranding, DEFAULT_BRANDING, BrandingConfig } from '../../utils/branding';

const apiPostMock = apiPost as jest.Mock;
const useFetchDomainsMock = useFetchDomains as jest.Mock;
const useFetchKeywordIdeasMock = useFetchKeywordIdeas as jest.Mock;
const useFetchSettingsMock = useFetchSettings as jest.Mock;
const mockGetBranding = getBranding as jest.MockedFunction<typeof getBranding>;

const baseDomain: DomainType = {
   ID: 1,
   domain: 'example.com',
   slug: 'example-slug',
   notification_emails: '',
   lastUpdated: '2024-01-01',
   added: '2024-01-01',
};

function renderLogin(queryClient: QueryClient) {
   const utils = render(
      <QueryClientProvider client={queryClient}>
         <Login />
      </QueryClientProvider>,
   );
   const [usernameInput, passwordInput] = Array.from(utils.container.querySelectorAll('input'));
   fireEvent.change(usernameInput, { target: { value: 'admin' } });
   fireEvent.change(passwordInput, { target: { value: 'secret' } });
   fireEvent.click(screen.getByRole('button', { name: 'Login' }));
   return utils;
}

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

const renderResearchPage = () => {
   useFetchDomainsMock.mockReturnValue({ data: { domains: [baseDomain] } });
   const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
   });
   return render(
      <QueryClientProvider client={queryClient}>
         <ResearchPage />
      </QueryClientProvider>,
   );
};

describe('Home Page', () => {
   const queryClient = new QueryClient();
   it('Should redirect to /domains route.', async () => {
       render(
           <QueryClientProvider client={queryClient}>
               <Home />
           </QueryClientProvider>,
       );
       expect(routerReplace).toHaveBeenCalledWith('/domains');
   });
});

describe('Login page', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      mockRouter.pathname = '/login';
      mockRouter.query = {};
   });

   it('marks the cached auth state as authenticated before navigating home', async () => {
      apiPostMock.mockResolvedValueOnce({ success: true });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      // The auth check ran before login and cached "logged out".
      queryClient.setQueryData(AUTH_QUERY_KEY, { isAuthenticated: false, isLoading: false });

      renderLogin(queryClient);

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/'));
      expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual({ isAuthenticated: true, isLoading: false });
      expect(apiPostMock).toHaveBeenCalledWith('/api/login', { username: 'admin', password: 'secret' });
   });

   it('keeps the user on the login page and leaves the cache alone when login fails', async () => {
      apiPostMock.mockRejectedValueOnce(new Error('Invalid credentials'));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(AUTH_QUERY_KEY, { isAuthenticated: false, isLoading: false });

      renderLogin(queryClient);

      await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
      expect(routerPush).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual({ isAuthenticated: false, isLoading: false });
   });
});

describe('Domain ideas page credentials handling', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      mockRouter.pathname = '/domain/ideas/[slug]';
      mockRouter.query = { slug: 'example-slug' };
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
      // The ideas are requested by the real domain name, not the URL slug
      expect(useFetchKeywordIdeasMock).toHaveBeenCalledWith(expect.anything(), expect.any(Boolean), 'example.com');
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

describe('Research page Ads integration flag', () => {
   it('opens the shared Add Domain modal from the top bar', () => {
      (useAddDomain as jest.Mock).mockReturnValue({ mutate: jest.fn(), isLoading: false });
      renderResearchPage();

      fireEvent.click(screen.getByRole('button', { name: 'Add Domain' }));

      expect(screen.getByTestId('adddomain_modal')).toBeInTheDocument();
   });

   beforeEach(() => {
      jest.clearAllMocks();
      mockRouter.pathname = '/research';
      mockRouter.query = {};
      useFetchKeywordIdeasMock.mockReturnValue({
         data: { data: { keywords: [], favorites: [], settings: undefined } },
         isLoading: false,
         isError: false,
      });
   });

   it('disables the load button when Google Ads credentials are incomplete', () => {
      useFetchSettingsMock.mockReturnValue({
         data: { settings: { adwords_refresh_token: 'token', adwords_developer_token: 'dev' } },
         isLoading: false,
      });

      renderResearchPage();

      const loadButton = screen.getByRole('button', { name: /load ideas/i });
      expect(loadButton).toHaveClass('cursor-not-allowed');
   });
});

describe('_app.tsx server-side branding', () => {
   beforeEach(() => {
      mockGetBranding.mockReturnValue(DEFAULT_BRANDING);
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('provides default and white-label branding via getInitialProps', async () => {
      const cases: BrandingConfig[] = [
         DEFAULT_BRANDING,
         {
            ...DEFAULT_BRANDING,
            whiteLabelEnabled: true,
            platformName: 'Acme SEO',
            logoFile: 'custom-logo.svg',
            hasCustomLogo: true,
            logoMimeType: 'image/svg+xml',
         },
      ];

      for (const branding of cases) {
         mockGetBranding.mockReturnValue(branding);

         const mockContext = {
            Component: () => <div>Test Page</div>,
            ctx: {} as any,
            router: {} as any,
         } as unknown as AppContext;

         const result = await MyApp.getInitialProps!(mockContext);

         expect(mockGetBranding).toHaveBeenCalled();
         expect(result.pageProps).toBeDefined();
         expect(result.pageProps.serverSideBranding).toEqual(branding);
      }
   });
});
