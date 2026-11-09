'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from 'utils/client/apiClient';

export const scKeywordsKey = (domain: string) => ['sc-keywords', domain] as const;

export const scKeywordsQueryOptions = (domain: string) => ({
   queryKey: scKeywordsKey(domain),
   queryFn: async () => (await apiGet<{ data: SCDomainDataType }>(`/api/google/searchconsole?domain=${encodeURIComponent(domain)}`)).data,
   retry: false as const,
});

/** Search Console data for a domain, as stored by the last refresh. */
export function useScKeywords(domain: string, enabled: boolean) {
   return useQuery({
      ...scKeywordsQueryOptions(domain),
      enabled,
   });
}
