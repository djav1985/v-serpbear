'use client';

import { useQuery } from '@tanstack/react-query';
import { callApi } from 'utils/client/apiClient';

export const scKeywordsKey = (domain: string) => ['sc-keywords', domain] as const;

export const scKeywordsQueryOptions = (domain: string) => ({
   queryKey: scKeywordsKey(domain),
   queryFn: async () => (await callApi('searchConsole.get', { query: { domain } })).searchConsole,
   retry: false as const,
});

/** Search Console data for a domain, as stored by the last refresh. */
export function useScKeywords(domain: string, enabled: boolean) {
   return useQuery({
      ...scKeywordsQueryOptions(domain),
      enabled,
   });
}
