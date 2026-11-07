import { useRouter, NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient, QueryClient, QueryKey } from 'react-query';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/client/apiClient';
import { showQueryErrorToast } from './queryErrorToast';

type UpdatePayload = {
   domainSettings: Partial<DomainSettings>,
   domain: DomainType
};

const normalizeDomainPatch = (
   patch: Partial<DomainSettings>,
   domain?: DomainType,
): Partial<DomainType> => {
   const updates: Partial<DomainType> = {};
   if (patch.scrapeEnabled !== undefined) {
      const nextValue = Boolean(patch.scrapeEnabled);
      updates.scrapeEnabled = nextValue;
   }
   if (typeof patch.notification_emails === 'string') {
      updates.notification_emails = patch.notification_emails;
   }
   if (Object.prototype.hasOwnProperty.call(patch, 'scraper_settings')) {
      const incoming = patch.scraper_settings;
      const currentType = domain?.scraper_settings?.scraper_type;
      const currentHasKey = domain?.scraper_settings?.has_api_key === true;

      if (!incoming || incoming.scraper_type === null || incoming.scraper_type === '') {
         updates.scraper_settings = null;
      } else {
         const nextType = typeof incoming.scraper_type === 'string' && incoming.scraper_type
            ? incoming.scraper_type
            : currentType ?? null;

         if (!nextType) {
            updates.scraper_settings = null;
         } else {
            let hasKey = currentHasKey && currentType === nextType;
            if (typeof incoming.scraping_api === 'string' && incoming.scraping_api.trim().length > 0) {
               hasKey = true;
            }
            if (incoming.clear_api_key) {
               hasKey = false;
            }

            updates.scraper_settings = {
               scraper_type: nextType,
               has_api_key: hasKey,
            };
         }
      }
   }
   return updates;
};

const applyDomainCachePatch = (
   queryClient: QueryClient,
   domain: DomainType,
   patch: Partial<DomainSettings>
) => {
   const normalizedPatch = normalizeDomainPatch(patch, domain);
   if (Object.keys(normalizedPatch).length === 0) { return; }

   const domainListQueries = queryClient.getQueriesData<{ domains: DomainType[] }>({ queryKey: ['domains'] });
   domainListQueries.forEach(([key, data]) => {
      if (!data?.domains) { return; }
      const updatedDomains = data.domains.map((item) => (item.ID === domain.ID ? { ...item, ...normalizedPatch } : item));
      queryClient.setQueryData(key, { ...data, domains: updatedDomains });
   });

   const singleDomainQueries = queryClient.getQueriesData<{ domain: DomainType }>({ queryKey: ['domain'] });
   singleDomainQueries.forEach(([key, data]) => {
      if (!data?.domain || data.domain.ID !== domain.ID) { return; }
      const updatedDomain = { ...data.domain, ...normalizedPatch };
      queryClient.setQueryData(key, { ...data, domain: updatedDomain });
   });
};

const updateDomainRequest = async ({ domainSettings, domain }: UpdatePayload) => {
   const encodedDomain = encodeURIComponent(domain.domain);
   return apiPut<{ domain: DomainType|null }>(`/api/domains?domain=${encodedDomain}`, domainSettings);
};

export async function fetchDomains(router: NextRouter, withStats:boolean): Promise<{domains: DomainType[]}> {
   return apiGet(`/api/domains${withStats ? '?withstats=true' : ''}`, router);
}

export async function fetchDomain(router: NextRouter, domainName: string): Promise<{domain: DomainType}> {
   const encodedDomain = encodeURIComponent(domainName);
   return apiGet(`/api/domain?domain=${encodedDomain}`, router);
}

/** The version of each tracked domain's saved thumbnail, by domain. The server starts any missing or old ones in the background. */
export async function fetchDomainThumbnails(): Promise<Record<string, string>> {
   const data = await apiGet<{ thumbnails: Record<string, string> }>('/api/thumbnail');
   return data?.thumbnails || {};
}

// No polling: the list is read when the page opens, so thumbnails generated meanwhile show on the next reload or navigation
export function useFetchDomainThumbnails() {
   return useQuery('domain-thumbnails', fetchDomainThumbnails, {
      refetchOnWindowFocus: false,
      retry: false,
   });
}

/** The address of a domain's saved thumbnail. The version (date and write time) makes a new image a new address. */
export const getDomainThumbnailUrl = (domain: string, version: string): string => (
   `/api/thumbnail?domain=${encodeURIComponent(domain)}&v=${encodeURIComponent(version)}`
);

/** Regenerates one domain's thumbnail now (the reload button). Resolves to the new thumbnail's version, or false when it failed. */
export async function regenerateDomainThumbnail(domain: string): Promise<string | false> {
   try {
      const data = await apiPost<{ thumbnail: string }>(`/api/thumbnail?domain=${encodeURIComponent(domain)}`, {});
      return data?.thumbnail || false;
   } catch {
      return false;
   }
}

export function useFetchDomains(router: NextRouter, withStats:boolean = false) {
   return useQuery(['domains', withStats], () => fetchDomains(router, withStats), {
      onError: (error) => showQueryErrorToast(error, 'Error Loading Domains.', 'domains-load-error'),
   });
}

export function useFetchDomain(router: NextRouter, domainName:string, onSuccess: (domain: DomainType) => void) {
   return useQuery(['domain', domainName], () => fetchDomain(router, domainName), {
      enabled: !!domainName,
      onSuccess: async (data) => {
         onSuccess(data.domain);
      },
      onError: (error) => showQueryErrorToast(error, 'Error Loading Domain.', 'domain-load-error'),
   });
}

export function useAddDomain(onSuccess: (show?: boolean) => void) {
   const router = useRouter();
   const queryClient = useQueryClient();
   return useMutation(async (domains:string[]) => (
      apiPost<{ domains: DomainType[] }>('/api/domains', { domains })
   ), {
      onSuccess: async (data) => {
         const newDomain:DomainType[] = data.domains;
         const singleDomain = newDomain.length === 1;
         toast(`${singleDomain ? newDomain[0].domain : `${newDomain.length} domains`} Added Successfully!`, { icon: '✔️' });
         onSuccess(false);
         if (singleDomain) {
            router.push(`/domain/${newDomain[0].slug}`);
         }
         queryClient.invalidateQueries(['domains']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Adding New Domain');
      },
   });
}

export function useUpdateDomain(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(updateDomainRequest, {
      onSuccess: async () => {
         toast('Settings Updated!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries({ queryKey: ['domains'] });
         queryClient.invalidateQueries({ queryKey: ['domain'] });
      },
      onError: (_error, _variables, _context) => {
         toast('Error Updating Domain Settings', { icon: '⚠️' });
      },
   });
}

type DomainToggleContext = {
   domainListQueries: Array<[unknown, { domains?: DomainType[] } | undefined]>;
   singleDomainQueries: Array<[unknown, { domain?: DomainType } | undefined]>;
};

export function useUpdateDomainToggles() {
   const queryClient = useQueryClient();
   return useMutation<Awaited<ReturnType<typeof updateDomainRequest>>, Error, UpdatePayload, DomainToggleContext>(updateDomainRequest, {
      onMutate: async (variables) => {
         await Promise.all([
            queryClient.cancelQueries({ queryKey: ['domains'] }),
            queryClient.cancelQueries({ queryKey: ['domain'] }),
         ]);

         const domainListQueries = queryClient.getQueriesData<{ domains: DomainType[] }>({ queryKey: ['domains'] });
         const singleDomainQueries = queryClient.getQueriesData<{ domain: DomainType }>({ queryKey: ['domain'] });

         applyDomainCachePatch(queryClient, variables.domain, variables.domainSettings);

         return { domainListQueries, singleDomainQueries };
      },
      onError: (error, _variables, context) => {
         if (context) {
         context.domainListQueries.forEach(([key, data]) => queryClient.setQueryData(key as QueryKey, data));
         context.singleDomainQueries.forEach(([key, data]) => queryClient.setQueryData(key as QueryKey, data));
         }
         const message = (error as Error)?.message || 'Error Updating Domain Settings';
         toast(message, { icon: '⚠️' });
      },
      onSettled: () => {
         queryClient.invalidateQueries({ queryKey: ['domains'] });
         queryClient.invalidateQueries({ queryKey: ['domain'] });
      },
   });
}

export function useDeleteDomain(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async (domain:DomainType) => (
      apiDelete(`/api/domains?domain=${encodeURIComponent(domain.domain)}`)
   ), {
      onSuccess: async () => {
         toast('Domain Removed Successfully!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries(['domains']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Removing Domain', { icon: '⚠️' });
      },
   });
}
