import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useAuth, AUTH_QUERY_KEY } from '../../hooks/useAuth';

// Mock next/router (not used by useAuth directly, but some transitive imports may need it)
jest.mock('next/router', () => jest.requireActual('next-router-mock'));

const originalFetch = global.fetch;
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit | undefined]>();

function createJsonResponse<T>(payload: T, status = 200): Response {
   return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (_name: string) => null },
      json: async () => payload,
      text: async () => JSON.stringify(payload),
   } as unknown as Response;
}

beforeAll(() => {
   global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
   global.fetch = originalFetch;
});

beforeEach(() => {
   fetchMock.mockReset();
});

describe('useAuth', () => {
   it('fetches auth status and returns isAuthenticated=true on success', async () => {
      fetchMock.mockResolvedValueOnce(
         createJsonResponse({ user: 'admin' }, 200),
      );

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
         <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toBe('admin');
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });

   it('returns isAuthenticated=false when API responds with non-ok status', async () => {
      fetchMock.mockResolvedValueOnce(
         createJsonResponse({ error: 'Unauthorized' }, 401),
      );

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
         <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.error).toBe('Failed to check authentication status');
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });

   it('shares a single fetch across multiple hook instances using the same query key', async () => {
      fetchMock.mockResolvedValue(
         createJsonResponse({ user: 'admin' }, 200),
      );

      // Both hooks share one QueryClient, so only one network call should occur.
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
         <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result: r1 } = renderHook(() => useAuth(), { wrapper });
      const { result: r2 } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => expect(r1.current.isLoading).toBe(false));
      await waitFor(() => expect(r2.current.isLoading).toBe(false));

      // Both instances should report authenticated
      expect(r1.current.isAuthenticated).toBe(true);
      expect(r2.current.isAuthenticated).toBe(true);

      // Only one fetch should have been made (shared cache key AUTH_QUERY_KEY)
      expect(fetchMock).toHaveBeenCalledTimes(1);
   });

   it('does not re-fetch on re-mount while cached result is still fresh', async () => {
      fetchMock.mockResolvedValue(
         createJsonResponse({ user: 'admin' }, 200),
      );

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
         <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      // First mount: fetches once
      const { result, unmount } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      unmount();

      // Second mount: cache still holds the result (cacheTime > 0), no new fetch
      fetchMock.mockClear();
      const { result: result2 } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result2.current.isLoading).toBe(false));

      expect(result2.current.isAuthenticated).toBe(true);
      // No additional network call should have occurred
      expect(fetchMock).toHaveBeenCalledTimes(0);
   });

   it('exports AUTH_QUERY_KEY as a stable constant array', () => {
      expect(AUTH_QUERY_KEY).toEqual(['auth-check']);
   });
});
