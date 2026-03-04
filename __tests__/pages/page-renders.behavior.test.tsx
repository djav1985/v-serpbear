import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import type { AppContext } from 'next/app';
import Home from '../../pages/index';
import ResearchPage from '../../pages/research';
import MyApp from '../../pages/_app';
import { useFetchKeywordIdeas } from '../../services/adwords';
import { useFetchSettings } from '../../services/settings';
import { getBranding, DEFAULT_BRANDING, BrandingConfig } from '../../utils/branding';

const routerPush = jest.fn();
jest.mock('next/router', () => ({
   useRouter: () => ({
      push: routerPush,
      pathname: '/research',
      query: {},
   }),
}));

jest.mock('../../services/adwords', () => ({
   useFetchKeywordIdeas: jest.fn(),
   useMutateKeywordIdeas: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('../../services/settings');

jest.mock('../../components/ideas/KeywordIdeasTable', () => () => <div data-testid="ideas-table" />);

jest.mock('../../utils/branding', () => ({
   ...jest.requireActual('../../utils/branding'),
   getBranding: jest.fn(),
}));

const useFetchKeywordIdeasMock = useFetchKeywordIdeas as jest.Mock;
const useFetchSettingsMock = useFetchSettings as jest.Mock;
const mockGetBranding = getBranding as jest.MockedFunction<typeof getBranding>;

const renderResearchPage = () => {
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
   it('Renders without crashing', async () => {
      render(
          <QueryClientProvider client={queryClient}>
              <Home />
          </QueryClientProvider>,
      );
      expect(await screen.findByRole('main')).toBeInTheDocument();
      expect(screen.queryByText('Add Domain')).not.toBeInTheDocument();
   });
   it('Should redirect to /domains route.', async () => {
       render(
           <QueryClientProvider client={queryClient}>
               <Home />
           </QueryClientProvider>,
       );
       expect(routerPush).toHaveBeenCalledWith('/domains');
   });
});

describe('Research page Ads integration flag', () => {
   beforeEach(() => {
      jest.clearAllMocks();
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

   it('provides default branding via getInitialProps', async () => {
      const mockContext = {
         Component: () => <div>Test Page</div>,
         ctx: {} as any,
         router: {} as any,
      } as unknown as AppContext;

      const result = await MyApp.getInitialProps!(mockContext);

      expect(mockGetBranding).toHaveBeenCalled();
      expect(result.pageProps).toBeDefined();
      expect(result.pageProps.serverSideBranding).toEqual(DEFAULT_BRANDING);
   });

   it('provides custom white-label branding via getInitialProps', async () => {
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         whiteLabelEnabled: true,
         platformName: 'Acme SEO',
         logoFile: 'custom-logo.svg',
         hasCustomLogo: true,
         logoMimeType: 'image/svg+xml',
      };

      mockGetBranding.mockReturnValue(customBranding);

      const mockContext = {
         Component: () => <div>Test Page</div>,
         ctx: {} as any,
         router: {} as any,
      } as unknown as AppContext;

      const result = await MyApp.getInitialProps!(mockContext);

      expect(result.pageProps.serverSideBranding).toEqual(customBranding);
      expect(result.pageProps.serverSideBranding.platformName).toBe('Acme SEO');
      expect(result.pageProps.serverSideBranding.whiteLabelEnabled).toBe(true);
   });

   it('renders without crashing with server-side branding', () => {
      const TestComponent = () => <div>Test Content</div>;

      const { container } = render(
         <MyApp
            Component={TestComponent}
            pageProps={{ serverSideBranding: DEFAULT_BRANDING }}
            router={{} as any}
         />,
      );

      expect(container.textContent).toContain('Test Content');
   });

   it('renders with custom branding in pageProps', () => {
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         platformName: 'Custom Platform',
         whiteLabelEnabled: true,
      };

      const TestComponent = () => <div>Test Content</div>;

      const { container } = render(
         <MyApp
            Component={TestComponent}
            pageProps={{ serverSideBranding: customBranding }}
            router={{} as any}
         />,
      );

      expect(container.textContent).toContain('Test Content');
   });
});
