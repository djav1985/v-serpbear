'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPut } from 'utils/client/apiClient';

/** The full domain, including the Search Console and scraper settings the list endpoint masks. */
export function useDomain(domainName: string, enabled: boolean) {
   return useQuery({
      queryKey: ['domain', domainName] as const,
      queryFn: async () => (await apiGet<{ domain: DomainType }>(`/api/serp/domain?domain=${encodeURIComponent(domainName)}`)).domain,
      enabled: enabled && !!domainName,
   });
}

const useDomainsInvalidator = () => {
   const queryClient = useQueryClient();
   return () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['domains'] }),
      queryClient.invalidateQueries({ queryKey: ['domain'] }),
   ]);
};

export function useUpdateDomain(onDone: () => void) {
   const invalidate = useDomainsInvalidator();
   return useMutation({
      mutationFn: ({ domain, settings }: { domain: string; settings: Partial<DomainSettings> }) => (
         apiPut<{ domain: DomainType | null }>(`/api/serp/domains?domain=${encodeURIComponent(domain)}`, settings)
      ),
      onSuccess: () => { toast.success('Settings updated!'); onDone(); invalidate(); },
      onError: () => { toast.error('Error updating domain settings'); },
   });
}

export function useDeleteDomain(onDone: () => void) {
   const invalidate = useDomainsInvalidator();
   return useMutation({
      mutationFn: (domain: string) => apiDelete(`/api/serp/domains?domain=${encodeURIComponent(domain)}`),
      onSuccess: () => { toast.success('Domain removed successfully!'); onDone(); invalidate(); },
      onError: () => { toast.error('Error removing domain'); },
   });
}
