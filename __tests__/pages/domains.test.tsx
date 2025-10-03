import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ReactQuery from '@tanstack/react-query';
import { dummyDomain } from '../../__mocks__/data';
import Domains from '../../pages/domains';
import router from 'next-router-mock';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

jest.mock('../../hooks/useBranding');

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
   element?.tagName === 'SPAN'
   && element.textContent?.replace(/\s+/g, ' ').includes(`${platformName} v${version} by Vontainment`);

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

jest.mock('@tanstack/react-query', () => {
   const actual = jest.requireActual('@tanstack/react-query');
   return {
      ...actual,
      useQuery: jest.fn(),
   };
});

const useQueryMock = ReactQuery.useQuery as jest.MockedFunction<typeof ReactQuery.useQuery>;

const buildUseQueryImplementation = (overrides?: QueryOverrides) => {
   const defaultSettings = {
      data: { settings: { version: '3.0.0', scraper_type: 'proxy', search_console_integrated: false } },
      isLoading: false,
      isSuccess: true,
   };
   const defaultDomains = {
      data: { domains: [dummyDomain] },
      isLoading: false,
      isSuccess: true,
   };

   const settingsResult = { ...defaultSettings, ...overrides?.settings };
   const domainsResult = { ...defaultDomains, ...overrides?.domains };

   return (config: any) => {
      const queryKey = config?.queryKey;
      if (Array.isArray(queryKey) && queryKey[0] === 'settings') {
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
   useQueryMock.mockImplementation(buildUseQueryImplementation());
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
   useQueryMock.mockReset();
});

describe('Domains Page', () => {
   const queryClient = new QueryClient();
   it('Renders without crashing', async () => {
      render(
          <QueryClientProvider client={queryClient}>
              <Domains />
          </QueryClientProvider>,
      );
      expect(screen.getByTestId('domains')).toBeInTheDocument();
   });
   it('Renders the Domain Component', async () => {
      const { container } = render(
          <QueryClientProvider client={queryClient}>
              <Domains />
          </QueryClientProvider>,
      );
      expect(container.querySelector('.domItem')).toBeInTheDocument();
   });

   it('displays the page loader while queries resolve', () => {
      useQueryMock.mockImplementation(buildUseQueryImplementation({
         settings: { isLoading: true, data: undefined },
         domains: { isLoading: true, data: undefined },
      }));

      render(
          <QueryClientProvider client={queryClient}>
              <Domains />
          </QueryClientProvider>,
      );

      const overlay = screen.getByTestId('page-loader-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveClass('fixed');
   });

   it('wraps page content with the shared body gutter', () => {
      const { container } = render(
          <QueryClientProvider client={queryClient}>
              <Domains />
          </QueryClientProvider>,
      );
      const layoutWrapper = container.querySelector('.desktop-container.py-6');
      expect(layoutWrapper).toBeInTheDocument();
      expect(layoutWrapper).toHaveClass('py-6');
   });
   it('Should Display Add Domain Modal on relveant Button Click.', async () => {
      render(<QueryClientProvider client={queryClient}><Domains /></QueryClientProvider>);
      const button = screen.getByTestId('addDomainButton');
      if (button) fireEvent.click(button);
      expect(screen.getByTestId('adddomain_modal')).toBeVisible();
   });
   it('does not render the legacy auto-migration banner', async () => {
      render(
          <QueryClientProvider client={queryClient}>
              <Domains />
          </QueryClientProvider>,
      );
      expect(screen.queryByText('Updating database automatically...')).not.toBeInTheDocument();
   });
   it('Should Display the version number in Footer.', async () => {
      render(<QueryClientProvider client={queryClient}><Domains /></QueryClientProvider>);
      expect(screen.getByText(footerTextMatcher('3.0.0'))).toBeVisible();
      expect(screen.queryByText(/Update to Version/i)).not.toBeInTheDocument();
   });
});
