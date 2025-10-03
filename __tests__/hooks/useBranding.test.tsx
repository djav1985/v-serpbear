import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBranding } from '../../hooks/useBranding';
import { DEFAULT_BRANDING, getBranding, BrandingConfig } from '../../utils/branding';

jest.mock('../../utils/branding', () => ({
   ...jest.requireActual('../../utils/branding'),
   getBranding: jest.fn(),
}));

const mockGetBranding = getBranding as jest.MockedFunction<typeof getBranding>;

// Mock fetch for client-side API calls
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

      // Mock Next.js __NEXT_DATA__ structure
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

      // Cleanup
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
      // Clear any existing __NEXT_DATA__
      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }

      const { result } = renderHook(() => useBranding(), { wrapper });

      expect(result.current.refetch).toBeDefined();
      expect(typeof result.current.refetch).toBe('function');
   });

   it('handles missing __NEXT_DATA__ gracefully on client', () => {
      // Ensure __NEXT_DATA__ is not defined
      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }

      const { result } = renderHook(() => useBranding(), { wrapper });

      // Should fall back to default branding
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

      // Cleanup
      if (typeof window !== 'undefined') {
         delete (window as any).__NEXT_DATA__;
      }
   });
});
