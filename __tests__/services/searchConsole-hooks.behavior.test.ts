import { useQuery } from 'react-query';
import {
   fetchSCInsight,
   fetchSCKeywords,
   useFetchSCInsight,
   useFetchSCKeywords,
} from '../../services/searchConsole';

jest.mock('react-query', () => ({
   useQuery: jest.fn(),
}));

describe('Search Console hooks', () => {
   const mockUseQuery = useQuery as unknown as jest.Mock;
   const originalFetch = global.fetch;
   const baseRouter = { push: jest.fn() } as any;

   beforeEach(() => {
      mockUseQuery.mockClear();
      (global as any).fetch = jest.fn().mockResolvedValue({
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue({ data: [] }),
      });
   });

   afterEach(() => {
      (global as any).fetch = originalFetch;
   });

   it('includes the slug in the Search Console keywords query key', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'first-slug' } };

      useFetchSCKeywords(routerWithSlug, true, false);

      expect(mockUseQuery).toHaveBeenCalledTimes(1);
      expect(mockUseQuery).toHaveBeenCalledWith(
         ['sckeywords', 'first-slug'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );

      mockUseQuery.mockClear();
      const routerWithoutSlug = { ...baseRouter, query: {} };

      useFetchSCKeywords(routerWithoutSlug, true, false);

      expect(mockUseQuery).toHaveBeenCalledWith(
         ['sckeywords', ''],
         expect.any(Function),
         expect.objectContaining({ enabled: false }),
      );
   });

   it('enables keyword queries when only domain-level credentials exist', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'domain-creds' } };

      useFetchSCKeywords(routerWithSlug, false, true);

      expect(mockUseQuery).toHaveBeenCalledWith(
         ['sckeywords', 'domain-creds'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );
   });

   it('includes the slug in the Search Console insight query key', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'insight-slug' } };

      useFetchSCInsight(routerWithSlug, true, false);

      expect(mockUseQuery).toHaveBeenCalledWith(
         ['scinsight', 'insight-slug'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );

      mockUseQuery.mockClear();
      const routerWithoutSlug = { ...baseRouter, query: {} };

      useFetchSCInsight(routerWithoutSlug, true, false);

      expect(mockUseQuery).toHaveBeenCalledWith(
         ['scinsight', ''],
         expect.any(Function),
         expect.objectContaining({ enabled: false }),
      );
   });

   it('enables insight queries when only domain-level credentials exist', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'insight-creds' } };

      useFetchSCInsight(routerWithSlug, false, true);

      expect(mockUseQuery).toHaveBeenCalledWith(
         ['scinsight', 'insight-creds'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );
   });

   it('refetches when the slug changes between invocations', () => {
      const firstRouter = { ...baseRouter, query: { slug: 'first' } };
      const secondRouter = { ...baseRouter, query: { slug: 'second' } };

      useFetchSCKeywords(firstRouter, true, false);
      useFetchSCKeywords(secondRouter, true, false);

      expect(mockUseQuery).toHaveBeenNthCalledWith(
         1,
         ['sckeywords', 'first'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );
      expect(mockUseQuery).toHaveBeenNthCalledWith(
         2,
         ['sckeywords', 'second'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );
   });

   it('refetches insight data when the slug changes', () => {
      const firstRouter = { ...baseRouter, query: { slug: 'alpha' } };
      const secondRouter = { ...baseRouter, query: { slug: 'beta' } };

      useFetchSCInsight(firstRouter, true, false);
      useFetchSCInsight(secondRouter, true, false);

      expect(mockUseQuery).toHaveBeenNthCalledWith(
         1,
         ['scinsight', 'alpha'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );
      expect(mockUseQuery).toHaveBeenNthCalledWith(
         2,
         ['scinsight', 'beta'],
         expect.any(Function),
         expect.objectContaining({ enabled: true }),
      );
   });

   it('skips fetch when slug is absent for keywords', async () => {
      const routerWithoutSlug = { ...baseRouter, query: {} };

      const result = await fetchSCKeywords(routerWithoutSlug);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toBeNull();
   });

   it('skips fetch when slug is absent for insight', async () => {
      const routerWithoutSlug = { ...baseRouter, query: {} };

      const result = await fetchSCInsight(routerWithoutSlug);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(result).toBeNull();
   });

   it('passes the slug to fetchers when present', async () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'live-slug' } };

      await fetchSCKeywords(routerWithSlug);
      await fetchSCInsight(routerWithSlug);

      expect(global.fetch).toHaveBeenNthCalledWith(
         1,
         expect.stringContaining('domain=live-slug'),
         expect.objectContaining({ method: 'GET' }),
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
         2,
         expect.stringContaining('domain=live-slug'),
         expect.objectContaining({ method: 'GET' }),
      );
   });
});
