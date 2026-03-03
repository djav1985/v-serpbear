import { useRouter, NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient, QueryClient, QueryKey } from 'react-query';
import { getClientOrigin } from '../utils/client/origin';
import { throwOnError } from '../utils/client/fetchWithError';
import { apiPut } from '../utils/client/apiClient';

type UpdatePayload = {
   domainSettings: Partial<DomainSettings>,
   domain: DomainType
};

const normalizeEnvFlag = (value: string | undefined) => {
   const normalized = (value || 'true').toLowerCase();
   return !['false', '0', 'off', 'disabled', 'no'].includes(normalized);
};

export const SCREENSHOTS_ENABLED = normalizeEnvFlag(process.env.NEXT_PUBLIC_SCREENSHOTS);

const normalizeDomainPatch = (
   patch: Partial<DomainSettings>,
   domain?: DomainType,
): Partial<DomainType> => {
   const updates: Partial<DomainType> = {};
   if (patch.scrapeEnabled !== undefined) {
      const nextValue = Boolean(patch.scrapeEnabled);
      updates.scrapeEnabled = nextValue;
      // Update the legacy notification field to match scrapeEnabled
      updates.notification = nextValue;
   }
   if (typeof patch.notification_interval === 'string') {
      updates.notification_interval = patch.notification_interval;
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
   const origin = getClientOrigin();
   const res = await fetch(`${origin}/api/domains${withStats ? '?withstats=true' : ''}`, { method: 'GET' });
   await throwOnError(res, router);
   return res.json();
}

export async function fetchDomain(router: NextRouter, domainName: string): Promise<{domain: DomainType}> {
   const origin = getClientOrigin();
   const encodedDomain = encodeURIComponent(domainName);
   const res = await fetch(`${origin}/api/domain?domain=${encodedDomain}`, { method: 'GET' });
   await throwOnError(res, router);
   return res.json();
}

type DomainThumbEntry = { data: string; ts: number };
const THUMB_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const isValidThumbEntry = (v: unknown): v is DomainThumbEntry =>
   typeof v === 'object' && v !== null && !Array.isArray(v) &&
   typeof (v as DomainThumbEntry).data === 'string' &&
   typeof (v as DomainThumbEntry).ts === 'number';

export async function fetchDomainScreenshot(domain: string, forceFetch = false): Promise<string | false> {
   if (!SCREENSHOTS_ENABLED) { return false; }
   if (typeof window === 'undefined' || !window.localStorage) { return false; }

   let domThumbs: Record<string, DomainThumbEntry> = {};
   const domainThumbsRaw = window.localStorage.getItem('domainThumbs');

   if (domainThumbsRaw) {
      try {
         const parsedThumbs = JSON.parse(domainThumbsRaw);
         if (
            parsedThumbs &&
            typeof parsedThumbs === 'object' &&
            !Array.isArray(parsedThumbs) &&
            Object.values(parsedThumbs).every(isValidThumbEntry)
         ) {
            domThumbs = parsedThumbs;
         } else if (parsedThumbs) {
            throw new Error('Corrupted cache: invalid format or content');
         }
      } catch (_error) {
         // Clear corrupted cache silently
         window.localStorage.removeItem('domainThumbs');
         domThumbs = {};
      }
   }

   const existing = domThumbs[domain];
   const isFresh = existing && !forceFetch && (Date.now() - existing.ts) < THUMB_TTL_MS;

   if (!isFresh) {
      try {
         const screenshotURL = `https://image.thum.io/get/maxAge/96/width/200/https://${domain}`;
         const domainImageRes = await fetch(screenshotURL);
         const domainImageBlob = domainImageRes.status === 200 ? await domainImageRes.blob() : false;
         if (domainImageBlob) {
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
               reader.onload = resolve;
               reader.onerror = reject;
               reader.readAsDataURL(domainImageBlob);
            });
            const imageBase: string = reader.result && typeof reader.result === 'string' ? reader.result : '';
            // Update only the specific domain entry to avoid rewriting the entire object
            domThumbs[domain] = { data: imageBase, ts: Date.now() };
            window.localStorage.setItem('domainThumbs', JSON.stringify(domThumbs));
            return imageBase;
         }
         return false;
        } catch (_error) {
           // Silently fail screenshot fetch
           return false;
        }
   }

   // isFresh is truthy, so existing is guaranteed to be a valid DomainThumbEntry
   return existing ? existing.data : false;
}

export function useFetchDomains(router: NextRouter, withStats:boolean = false) {
   return useQuery(['domains', withStats], () => fetchDomains(router, withStats));
}

export function useFetchDomain(router: NextRouter, domainName:string, onSuccess: Function) {
   return useQuery(['domain', domainName], () => fetchDomain(router, domainName), {
      enabled: !!domainName,
      onSuccess: async (data) => {
         onSuccess(data.domain);
      },
   });
}

export function useAddDomain(onSuccess:Function) {
   const router = useRouter();
   const queryClient = useQueryClient();
   return useMutation(async (domains:string[]) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ domains }) };
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/domains`, fetchOpts);
      await throwOnError(res);
      return res.json();
   }, {
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

export function useUpdateDomain(onSuccess:Function) {
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

export function useDeleteDomain(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async (domain:DomainType) => {
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/domains?domain=${domain.domain}`, { method: 'DELETE' });
      await throwOnError(res);
      return res.json();
   }, {
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
