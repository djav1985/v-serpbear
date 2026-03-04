import { renderHook, waitFor } from '@testing-library/react';
import mockRouter from 'next-router-mock';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useBranding } from '../../hooks/useBranding';
import { useFetchDomains } from '../../services/domains';
import { DEFAULT_BRANDING, getBranding, BrandingConfig } from '../../utils/branding';
import { createWrapper } from '../../__mocks__/utils';
import { dummyDomain } from '../../__mocks__/data';

jest.mock('../../utils/branding', () => ({
   ...jest.requireActual('../../utils/branding'),
   getBranding: jest.fn(),
}));

jest.mock('next/router', () => jest.requireActual('next-router-mock'));

const mockGetBranding = getBranding as jest.MockedFunction<typeof getBranding>;

// ---------------------------------------------------------------------------
// useFetchDomains
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>();

const asUrlString = (input: RequestInfo | URL): string => {
   if (typeof input === 'string') return input;
   if (input instanceof URL) return input.toString();
   if (typeof (input as Request).url === 'string') return (input as Request).url;
   return String(input);
};

function createJsonResponse<T>(payload: T, status = 200): Response {
   return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
   } as unknown as Response;
}

beforeAll(() => {
   global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
   global.fetch = originalFetch;
});

beforeEach(() => {
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
});

describe('DomainHooks', () => {
   it('useFetchDomains should fetch the Domains', async () => {
      const { result } = renderHook(() => useFetchDomains(mockRouter, false), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
   });
});

// ---------------------------------------------------------------------------
// useBranding hook
// ---------------------------------------------------------------------------

global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('useBranding hook', () => {
   let queryClient: QueryClient;

   beforeEach(() => {
      queryClient = new QueryClient({
         defaultOptions: {
            queries: {
               retry: false,
            },
         },
      });
      mockGetBranding.mockReturnValue(DEFAULT_BRANDING);
      mockFetch.mockClear();
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
   );

   it('returns default branding when server-side data is not available', () => {
      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.branding).toEqual(DEFAULT_BRANDING);
      expect(result.current.branding.platformName).toBe('SerpBear');
   });

   it('uses server-side branding from __NEXT_DATA__ on client-side initial render', () => {
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         whiteLabelEnabled: true,
         platformName: 'Acme SEO',
         logoFile: 'acme.png',
         hasCustomLogo: true,
         logoMimeType: 'image/png',
      };

      if (typeof window !== 'undefined') {
         (window as any).__NEXT_DATA__ = {
            props: {
               pageProps: {
                  serverSideBranding: customBranding,
               },
            },
         };
      }

      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.branding.platformName).toBe('Acme SEO');
      expect(result.current.branding.whiteLabelEnabled).toBe(true);

      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }
   });

   it('falls back to DEFAULT_BRANDING when server-side branding is unavailable', () => {
      mockGetBranding.mockReturnValue(DEFAULT_BRANDING);

      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.branding).toEqual(DEFAULT_BRANDING);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
   });

   it('provides refetch function for manual updates', () => {
      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }

      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe('function');
   });

   it('handles missing __NEXT_DATA__ gracefully on client', () => {
      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }

      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.branding).toEqual(DEFAULT_BRANDING);
   });

   it('preserves white-label settings from server-side data', () => {
      const whiteLabelBranding: BrandingConfig = {
         defaultPlatformName: 'SerpBear',
         whiteLabelEnabled: true,
         platformName: 'White Label SEO',
         logoFile: 'whitelabel-logo.svg',
         hasCustomLogo: true,
         logoMimeType: 'image/svg+xml',
         logoApiPath: '/api/branding/logo',
      };

      if (typeof window !== 'undefined') {
         (window as any).__NEXT_DATA__ = {
            props: {
               pageProps: {
                  serverSideBranding: whiteLabelBranding,
               },
            },
         };
      }

      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.branding.whiteLabelEnabled).toBe(true);
      expect(result.current.branding.platformName).toBe('White Label SEO');
      expect(result.current.branding.hasCustomLogo).toBe(true);
      expect(result.current.branding.logoFile).toBe('whitelabel-logo.svg');

      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }
   });
});
