'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from 'utils/client/apiClient';

export const scKeywordsKey = (domain: string) => ['sc-keywords', domain] as const;

/** Search Console data for a domain, as stored by the last refresh. */
export function useScKeywords(domain: string, enabled: boolean) {
   return useQuery({
      queryKey: scKeywordsKey(domain),
      queryFn: async () => (await apiGet<{ data: SCDomainDataType }>(`/api/searchconsole?domain=${encodeURIComponent(domain)}`)).data,
      enabled,
      retry: false,
   });
}
