import { useQuery } from '@tanstack/react-query';
import {
   fetchSCInsight,
   fetchSCKeywords,
   useFetchSCInsight,
   useFetchSCKeywords,
} from '../../services/searchConsole';

jest.mock('@tanstack/react-query', () => ({
   useQuery: jest.fn(),
}));

describe('Search Console hooks', () => {
   const mockUseQuery = useQuery as unknown as jest.Mock;
   const originalFetch = global.fetch;
   const baseRouter = { push: jest.fn() } as any;

   beforeEach(() => {
      mockUseQuery.mockClear();
      mockUseQuery.mockReturnValue({});
      (global as any).fetch = jest.fn().mockResolvedValue({
         status: 200,
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
      const firstCallConfig = mockUseQuery.mock.calls[0][0];
      expect(firstCallConfig).toMatchObject({
         queryKey: ['sckeywords', 'first-slug'],
         enabled: true,
      });
      expect(firstCallConfig.queryFn).toBeInstanceOf(Function);

      mockUseQuery.mockClear();
      const routerWithoutSlug = { ...baseRouter, query: {} };

      useFetchSCKeywords(routerWithoutSlug, true, false);

      const secondCallConfig = mockUseQuery.mock.calls[0][0];
      expect(secondCallConfig).toMatchObject({
         queryKey: ['sckeywords', ''],
         enabled: false,
      });
      expect(secondCallConfig.queryFn).toBeInstanceOf(Function);
   });

   it('enables keyword queries when only domain-level credentials exist', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'domain-creds' } };

      useFetchSCKeywords(routerWithSlug, false, true);

      const config = mockUseQuery.mock.calls[0][0];
      expect(config).toMatchObject({
         queryKey: ['sckeywords', 'domain-creds'],
         enabled: true,
      });
      expect(config.queryFn).toBeInstanceOf(Function);
   });

   it('includes the slug in the Search Console insight query key', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'insight-slug' } };

      useFetchSCInsight(routerWithSlug, true, false);

      const insightCall = mockUseQuery.mock.calls[0][0];
      expect(insightCall).toMatchObject({
         queryKey: ['scinsight', 'insight-slug'],
         enabled: true,
      });
      expect(insightCall.queryFn).toBeInstanceOf(Function);

      mockUseQuery.mockClear();
      const routerWithoutSlug = { ...baseRouter, query: {} };

      useFetchSCInsight(routerWithoutSlug, true, false);

      const insightNoSlug = mockUseQuery.mock.calls[0][0];
      expect(insightNoSlug).toMatchObject({
         queryKey: ['scinsight', ''],
         enabled: false,
      });
      expect(insightNoSlug.queryFn).toBeInstanceOf(Function);
   });

   it('enables insight queries when only domain-level credentials exist', () => {
      const routerWithSlug = { ...baseRouter, query: { slug: 'insight-creds' } };

      useFetchSCInsight(routerWithSlug, false, true);

      const credsConfig = mockUseQuery.mock.calls[0][0];
      expect(credsConfig).toMatchObject({
         queryKey: ['scinsight', 'insight-creds'],
         enabled: true,
      });
      expect(credsConfig.queryFn).toBeInstanceOf(Function);
   });

   it('refetches when the slug changes between invocations', () => {
      const firstRouter = { ...baseRouter, query: { slug: 'first' } };
      const secondRouter = { ...baseRouter, query: { slug: 'second' } };

      useFetchSCKeywords(firstRouter, true, false);
      useFetchSCKeywords(secondRouter, true, false);

      const firstKeywordCall = mockUseQuery.mock.calls[0][0];
      const secondKeywordCall = mockUseQuery.mock.calls[1][0];
      expect(firstKeywordCall).toMatchObject({
         queryKey: ['sckeywords', 'first'],
         enabled: true,
      });
      expect(secondKeywordCall).toMatchObject({
         queryKey: ['sckeywords', 'second'],
         enabled: true,
      });
   });

   it('refetches insight data when the slug changes', () => {
      const firstRouter = { ...baseRouter, query: { slug: 'alpha' } };
      const secondRouter = { ...baseRouter, query: { slug: 'beta' } };

      useFetchSCInsight(firstRouter, true, false);
      useFetchSCInsight(secondRouter, true, false);

      const firstInsightCall = mockUseQuery.mock.calls[0][0];
      const secondInsightCall = mockUseQuery.mock.calls[1][0];
      expect(firstInsightCall).toMatchObject({
         queryKey: ['scinsight', 'alpha'],
         enabled: true,
      });
      expect(secondInsightCall).toMatchObject({
         queryKey: ['scinsight', 'beta'],
         enabled: true,
      });
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
         { method: 'GET' },
      );
      expect(global.fetch).toHaveBeenNthCalledWith(
         2,
         expect.stringContaining('domain=live-slug'),
         { method: 'GET' },
      );
   });
});
