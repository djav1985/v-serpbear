/**
 * Test for improved error handling in service functions
 * This test verifies that HTML error responses are handled gracefully without JSON parsing errors
 */

import toast from 'react-hot-toast';

const mockOrigin = 'http://localhost:3000';

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => mockOrigin,
}));

// Mock window.location.origin
Object.defineProperty(window, 'location', {
   value: {
      origin: mockOrigin
   },
   writable: true
});

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/router', () => ({
   useRouter: () => ({
      push: mockPush,
      pathname: '/test',
      query: { slug: 'test-domain' }
   })
}));

// Mock react-query
const mockInvalidateQueries = jest.fn();
jest.mock('react-query', () => ({
   useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries
   }),
   useMutation: (fn: any, options: any = {}) => ({
      mutate: async (data: any) => {
         try {
            const result = await fn(data);
            if (options.onSuccess) {
               await options.onSuccess(result, data, undefined);
            }
            return result;
         } catch (error) {
            if (options.onError) options.onError(error, data, undefined);
            throw error;
         }
      }
   }),
   useQuery: () => ({})
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
   __esModule: true,
   default: jest.fn()
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Improved Error Handling in Services', () => {
   beforeEach(() => {
      mockFetch.mockClear();
      mockPush.mockClear();
      mockInvalidateQueries.mockClear();
      mockInvalidateQueries.mockResolvedValue(undefined);
      (toast as unknown as jest.Mock).mockClear();
   });

   it('should handle HTML error responses from /api/refresh gracefully', async () => {
      // Mock HTML error response (simulating Next.js error page)
      mockFetch.mockResolvedValueOnce({
         status: 400,
         ok: false,
         headers: {
            get: jest.fn().mockReturnValue('text/html')
         },
         text: jest.fn().mockResolvedValue('<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Internal Server Error</h1></body></html>')
      } as any);

      const { useRefreshKeywords } = require('../../services/keywords');
      
      const refreshMutation = useRefreshKeywords(() => {});
      
      try {
         await refreshMutation.mutate({ ids: [], domain: 'example.com' });
         fail('Expected error to be thrown');
      } catch (error) {
         expect(error).toBeInstanceOf(Error);
         expect((error as Error).message).toBe('Server error (400): Please try again later');
         // Verify that we don't get JSON parsing error
         expect((error as Error).message).not.toContain('Unexpected token');
      }
   });

   it('should handle HTML error responses from /api/ideas gracefully', async () => {
      // Mock HTML error response
      mockFetch.mockResolvedValueOnce({
         status: 500,
         ok: false,
         headers: {
            get: jest.fn().mockReturnValue('text/html')
         },
         text: jest.fn().mockResolvedValue('<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Internal Server Error</h1></body></html>')
      } as any);

      const { useMutateKeywordIdeas } = require('../../services/adwords');
      const mockRouter = { push: mockPush, pathname: '/test', query: { slug: 'test-domain' } };
      
      const ideasMutation = useMutateKeywordIdeas(mockRouter, () => {});
      
      try {
         await ideasMutation.mutate({ keywords: ['test'] });
         fail('Expected error to be thrown');
      } catch (error) {
         expect(error).toBeInstanceOf(Error);
         expect((error as Error).message).toBe('Server error (500): Please try again later');
         // Verify that we don't get JSON parsing error
         expect((error as Error).message).not.toContain('Unexpected token');
      }
   });

   it('should still handle valid JSON error responses correctly', async () => {
      // Mock valid JSON error response
      mockFetch.mockResolvedValueOnce({
         status: 400,
         ok: false,
         headers: {
            get: jest.fn().mockReturnValue('application/json')
         },
         text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Invalid domain provided' })),
         json: jest.fn().mockResolvedValue({ error: 'Invalid domain provided' })
      } as any);

      const { useRefreshKeywords } = require('../../services/keywords');
      const refreshMutation = useRefreshKeywords(() => {});
      
      try {
         await refreshMutation.mutate({ ids: [], domain: 'example.com' });
         fail('Expected error to be thrown');
      } catch (error) {
         expect(error).toBeInstanceOf(Error);
         expect((error as Error).message).toBe('Invalid domain provided');
      }
   });

   it('should handle response parsing errors gracefully', async () => {
      // Mock response that throws error when trying to read JSON
      mockFetch.mockResolvedValueOnce({
         status: 400,
         ok: false,
         headers: {
            get: jest.fn().mockReturnValue('application/json')
         },
         json: jest.fn().mockRejectedValue(new Error('Unexpected token'))
      } as any);

      const { useRefreshKeywords } = require('../../services/keywords');
      const refreshMutation = useRefreshKeywords(() => {});
      
      try {
         await refreshMutation.mutate({ ids: [], domain: 'example.com' });
         fail('Expected error to be thrown');
      } catch (error) {
         expect(error).toBeInstanceOf(Error);
         expect((error as Error).message).toBe('Server error (400): Please try again later');
      }
   });

   it('invalidates keyword cache after bulk refresh completes', async () => {
      mockFetch.mockResolvedValueOnce({
         status: 200,
         ok: true,
         headers: {
            get: jest.fn().mockReturnValue('application/json')
         },
         json: jest.fn().mockResolvedValue({ keywords: [] })
      } as any);

      const { useRefreshKeywords } = require('../../services/keywords');
      const onSuccess = jest.fn();
      const refreshMutation = useRefreshKeywords(onSuccess);

      await refreshMutation.mutate({ ids: [1, 2], domain: '' });

      expect(onSuccess).toHaveBeenCalled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith(['keywords']);
   });

   it('surfaces not-found keyword idea responses as warnings', async () => {
      mockFetch.mockResolvedValueOnce({
         status: 404,
         ok: false,
         headers: {
            get: jest.fn().mockReturnValue('application/json')
         },
         text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'No keywords found over the search volume minimum.' }))
      } as any);

      const { useMutateKeywordIdeas } = require('../../services/adwords');
      const mockRouter = { push: mockPush, pathname: '/test', query: { slug: 'test-domain' } };

      const ideasMutation = useMutateKeywordIdeas(mockRouter as any, () => {});

      await expect(ideasMutation.mutate({ keywords: ['test'] })).rejects.toThrow('No keywords found over the search volume minimum.');

      expect((toast as unknown as jest.Mock)).toHaveBeenCalledWith('No keywords found over the search volume minimum.', { icon: '⚠️' });
   });

   it('redirects to login when keyword idea requests return 401', async () => {
      mockFetch.mockResolvedValueOnce({
         status: 401,
         ok: false,
         headers: {
            get: jest.fn().mockReturnValue('application/json')
         },
         text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'Session expired' }))
      } as any);

      const { useMutateKeywordIdeas } = require('../../services/adwords');
      const mockRouter = { push: mockPush, pathname: '/test', query: { slug: 'test-domain' } };

      const ideasMutation = useMutateKeywordIdeas(mockRouter as any, () => {});

      await expect(ideasMutation.mutate({ keywords: ['test'] })).rejects.toThrow('Session expired');
      expect(mockPush).toHaveBeenCalledWith('/login');
   });

   it('logs successful keyword ideas and invalidates the cached query', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
         status: 200,
         ok: true,
         headers: {
            get: jest.fn().mockReturnValue('application/json')
         },
         text: jest.fn().mockResolvedValue(JSON.stringify({ ideas: ['alpha'] }))
      } as any);

      const { useMutateKeywordIdeas } = require('../../services/adwords');
      const mockRouter = { push: mockPush, pathname: '/test', query: { slug: 'test-domain' } };
      const onSuccess = jest.fn();

      const ideasMutation = useMutateKeywordIdeas(mockRouter as any, onSuccess);

      await ideasMutation.mutate({ keywords: ['test'] });

      expect(logSpy).toHaveBeenCalledWith('Ideas Added:', { ideas: ['alpha'] });
      expect(onSuccess).toHaveBeenCalledWith(false);
      expect(mockInvalidateQueries).toHaveBeenCalledWith('keywordIdeas-test-domain');
      expect((toast as unknown as jest.Mock)).toHaveBeenCalledWith('Keyword Ideas Loaded Successfully!', { icon: '✔️' });

      logSpy.mockRestore();
   });
});
