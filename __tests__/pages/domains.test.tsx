import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import * as ReactQuery from 'react-query';
import { dummyDomain } from '../../__mocks__/data';
import Domains from '../../pages/domains';
import router from 'next-router-mock';
import toast from 'react-hot-toast';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

jest.mock('../../hooks/useBranding');
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const toastMock = toast as unknown as jest.Mock;

const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

// Mock the useAuth hook to always return authenticated state
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: 'testuser',
  }),
  useAuthRequired: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: 'testuser',
  }),
  withAuth: (Component: any) => Component, // Return component unwrapped for testing
}));

const originalFetch = global.fetch;
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>();

const asUrlString = (input: RequestInfo | URL): string => {
   if (typeof input === 'string') return input;
   if (input instanceof URL) return input.toString();
   if (typeof (input as Request).url === 'string') return (input as Request).url;
   return String(input);
};

const footerTextMatcher = (version: string, platformName = DEFAULT_BRANDING.platformName) => (_: string, element?: Element | null) =>
   (element?.tagName === 'SPAN'
   && element.textContent?.replace(/\s+/g, ' ').includes(`${platformName} v${version} by Vontainment`)) ?? false;

function createJsonResponse<T>(payload: T, status = 200): Response {
   return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
   } as unknown as Response;
}

jest.mock('next/router', () => jest.requireActual('next-router-mock'));

type QueryOverrides = {
   settings?: Partial<ReturnType<typeof ReactQuery.useQuery>>;
   domains?: Partial<ReturnType<typeof ReactQuery.useQuery>>;
};

const useQuerySpy = jest.spyOn(ReactQuery, 'useQuery');

const buildUseQueryImplementation = (overrides?: QueryOverrides) => {
   const defaultSettings = {
      data: { settings: { version: '4.0.0', scraper_type: 'serpapi', search_console_integrated: false } },
      isLoading: false,
      isSuccess: true,
      refetch: jest.fn().mockResolvedValue({}),
   };
   const defaultDomains = {
      data: { domains: [dummyDomain] },
      isLoading: false,
      isSuccess: true,
   };

   const settingsResult = { ...defaultSettings, ...overrides?.settings };
   const domainsResult = { ...defaultDomains, ...overrides?.domains };

   return (queryKey: ReactQuery.QueryKey) => {
      if (queryKey === 'settings') {
         return settingsResult;
      }
      if (Array.isArray(queryKey) && queryKey[0] === 'domains') {
         return domainsResult;
      }
      return { data: undefined, isLoading: false };
   };
};

beforeAll(() => {
   global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
   global.fetch = originalFetch;
   useQuerySpy.mockRestore();
});

beforeEach(() => {
   router.isReady = true;
   mockUseBranding.mockReturnValue({
      branding: DEFAULT_BRANDING,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
   });
   useQuerySpy.mockImplementation(buildUseQueryImplementation() as Parameters<typeof useQuerySpy.mockImplementation>[0]);
   fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = asUrlString(input);
      if (url.startsWith(`${window.location.origin}/api/domains`)) {
         return createJsonResponse({ domains: [dummyDomain] });
      }
      throw new Error(`Unhandled fetch request: ${url}`);
   });
});

afterEach(() => {
   fetchMock.mockReset();
   useQuerySpy.mockReset();
});

describe('Domains Page', () => {
   const queryClient = new QueryClient();
   it('handles malformed search console JSON gracefully', async () => {
      useQuerySpy.mockImplementation(buildUseQueryImplementation({
         domains: {
            data: {
               domains: [{
                  ...dummyDomain,
                  search_console: '{bad-json',
               }],
            },
            isLoading: false,
            isSuccess: true,
         },
      }) as Parameters<typeof useQuerySpy.mockImplementation>[0]);

      render(
         <QueryClientProvider client={queryClient}>
            <Domains />
         </QueryClientProvider>,
      );

      expect(screen.getByTestId('domains')).toBeInTheDocument();
   });

   it('displays the page loader while queries resolve', () => {
      useQuerySpy.mockImplementation(buildUseQueryImplementation({
         settings: { isLoading: true, data: undefined },
         domains: { isLoading: true, data: undefined },
      }) as Parameters<typeof useQuerySpy.mockImplementation>[0]);

      render(
          <QueryClientProvider client={queryClient}>
              <Domains />
          </QueryClientProvider>,
      );

      const overlay = screen.getByTestId('page-loader-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveClass('fixed');
   });

   it('Should Display Add Domain Modal on relveant Button Click.', async () => {
      render(<QueryClientProvider client={queryClient}><Domains /></QueryClientProvider>);
      const button = screen.getByTestId('addDomainButton');
      if (button) fireEvent.click(button);
      expect(screen.getByTestId('adddomain_modal')).toBeVisible();
   });
   it('Should Display the version number in Footer.', async () => {
      render(<QueryClientProvider client={queryClient}><Domains /></QueryClientProvider>);
      expect(screen.getByText(footerTextMatcher('4.0.0'))).toBeVisible();
      expect(screen.queryByText(/Update to Version/i)).not.toBeInTheDocument();
   });
});

describe('Google Ads OAuth redirect handling on the domains page', () => {
   beforeEach(() => {
      toastMock.mockClear();
      router.setCurrentUrl('/domains');
   });

   it('shows a success toast, refetches settings and strips the ads params', () => {
      router.setCurrentUrl('/domains?ads=integrated&status=success');
      render(<QueryClientProvider client={new QueryClient()}><Domains /></QueryClientProvider>);

      expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
      expect(router.query).toEqual({});
   });

   it('shows the upstream error message when the integration failed', () => {
      router.setCurrentUrl('/domains?ads=integrated&status=error&detail=Custom%20error%20from%20redirect');
      render(<QueryClientProvider client={new QueryClient()}><Domains /></QueryClientProvider>);

      expect(toastMock).toHaveBeenCalledWith('Custom error from redirect', { icon: '⚠️' });
      expect(router.query).toEqual({});
   });

   it('falls back to the default error message when no detail is given', () => {
      router.setCurrentUrl('/domains?ads=integrated&status=error');
      render(<QueryClientProvider client={new QueryClient()}><Domains /></QueryClientProvider>);

      expect(toastMock).toHaveBeenCalledWith('Google Ads integration failed. Please try again.', { icon: '⚠️' });
   });

   it('ignores the redirect when the ads param is not "integrated"', () => {
      router.setCurrentUrl('/domains?ads=other&status=success');
      render(<QueryClientProvider client={new QueryClient()}><Domains /></QueryClientProvider>);

      expect(toastMock).not.toHaveBeenCalled();
      expect(router.query).toEqual({ ads: 'other', status: 'success' });
   });

   it('keeps unrelated query params when removing the integration params', () => {
      router.setCurrentUrl('/domains?ads=integrated&status=success&keep=this');
      render(<QueryClientProvider client={new QueryClient()}><Domains /></QueryClientProvider>);

      expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
      expect(router.query).toEqual({ keep: 'this' });
   });
});
