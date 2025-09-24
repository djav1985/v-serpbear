import { useRouter, NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient, QueryClient, QueryKey } from 'react-query';

type UpdatePayload = {
   domainSettings: Partial<DomainSettings>,
   domain: DomainType
};

export const normalizeEnvFlag = (value: string | undefined) => {
   const normalized = (value || 'true').toLowerCase();
   return !['false', '0', 'off', 'disabled', 'no'].includes(normalized);
};

export const SCREENSHOTS_ENABLED = normalizeEnvFlag(process.env.NEXT_PUBLIC_SCREENSHOTS);

const normalizeDomainPatch = (patch: Partial<DomainSettings>): Partial<DomainType> => {
   const updates: Partial<DomainType> = {};
   if (typeof patch.scrape_enabled === 'boolean') {
      updates.scrape_enabled = patch.scrape_enabled;
      // Update the legacy notification field to match scrape_enabled
      updates.notification = patch.scrape_enabled;
   }
   if (typeof patch.notification_interval === 'string') {
      updates.notification_interval = patch.notification_interval;
   }
   if (typeof patch.notification_emails === 'string') {
      updates.notification_emails = patch.notification_emails;
   }
   return updates;
};

const applyDomainCachePatch = (
   queryClient: QueryClient,
   domain: DomainType,
   patch: Partial<DomainSettings>
) => {
   const normalizedPatch = normalizeDomainPatch(patch);
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
   const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
   const fetchOpts = { method: 'PUT', headers, body: JSON.stringify(domainSettings) };
   const res = await fetch(`${window.location.origin}/api/domains?domain=${domain.domain}`, fetchOpts);
   const responseObj = await res.json();
   if (res.status >= 400 && res.status < 600) {
      throw new Error(responseObj?.error || 'Bad response from server');
   }
   return responseObj as { domain: DomainType|null };
};

export async function fetchDomains(router: NextRouter, withStats:boolean): Promise<{domains: DomainType[]}> {
   const res = await fetch(`${window.location.origin}/api/domains${withStats ? '?withstats=true' : ''}`, { method: 'GET' });
   if (res.status >= 400 && res.status < 600) {
      if (res.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      let errorMessage = 'Bad response from server';
      try {
         const contentType = res.headers.get('content-type');
         if (contentType && contentType.includes('application/json')) {
            const errorData = await res.json();
            errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
         } else {
            // Handle HTML error pages or other non-JSON responses
            const textResponse = await res.text();
            console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
      } catch (parseError) {
         console.warn('Failed to parse error response:', parseError);
         errorMessage = `Server error (${res.status}): Please try again later`;
      }
      throw new Error(errorMessage);
   }
   return res.json();
}

export async function fetchDomain(router: NextRouter, domainName: string): Promise<{domain: DomainType}> {
   const encodedDomain = encodeURIComponent(domainName);
   const res = await fetch(`${window.location.origin}/api/domain?domain=${encodedDomain}`, { method: 'GET' });
   if (res.status >= 400 && res.status < 600) {
      if (res.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      let errorMessage = 'Bad response from server';
      try {
         const contentType = res.headers.get('content-type');
         if (contentType && contentType.includes('application/json')) {
            const errorData = await res.json();
            errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
         } else {
            // Handle HTML error pages or other non-JSON responses
            const textResponse = await res.text();
            console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
      } catch (parseError) {
         console.warn('Failed to parse error response:', parseError);
         errorMessage = `Server error (${res.status}): Please try again later`;
      }
      throw new Error(errorMessage);
   }
   return res.json();
}

export async function fetchDomainScreenshot(domain: string, forceFetch = false): Promise<string | false> {
   if (!SCREENSHOTS_ENABLED) { return false; }
   if (typeof window === 'undefined' || !window.localStorage) { return false; }

   let domThumbs: Record<string, string> = {};
   const domainThumbsRaw = window.localStorage.getItem('domainThumbs');

   if (domainThumbsRaw) {
      try {
         const parsedThumbs = JSON.parse(domainThumbsRaw);
         if (
            parsedThumbs &&
            typeof parsedThumbs === 'object' &&
            !Array.isArray(parsedThumbs) &&
            Object.values(parsedThumbs).every((v) => typeof v === 'string')
         ) {
            domThumbs = parsedThumbs;
         } else if (parsedThumbs) {
            throw new Error('Corrupted cache: invalid format or content');
         }
      } catch (error) {
         console.warn('[WARN] Invalid cached domainThumbs data detected. Clearing corrupted screenshot cache.', error);
         window.localStorage.removeItem('domainThumbs');
         domThumbs = {};
      }
   }

   if (!domThumbs[domain] || forceFetch) {
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
            window.localStorage.setItem('domainThumbs', JSON.stringify({ ...domThumbs, [domain]: imageBase }));
            return imageBase;
         }
         return false;
      } catch (error) {
         return false;
      }
   } else if (domThumbs[domain]) {
      return domThumbs[domain];
   }

   return false;
}

export function useFetchDomains(router: NextRouter, withStats:boolean = false) {
   return useQuery(['domains', withStats], () => fetchDomains(router, withStats));
}

export function useFetchDomain(router: NextRouter, domainName:string, onSuccess: Function) {
   return useQuery(['domain', domainName], () => fetchDomain(router, domainName), {
      enabled: !!domainName,
      onSuccess: async (data) => {
         console.log('Domain Loaded!!!', data.domain);
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
      const res = await fetch(`${window.location.origin}/api/domains`, fetchOpts);
      if (res.status >= 400 && res.status < 600) {
         let errorMessage = 'Bad response from server';
         try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
               const errorData = await res.json();
               errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
            } else {
               // Handle HTML error pages or other non-JSON responses
               const textResponse = await res.text();
               console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
               errorMessage = `Server error (${res.status}): Please try again later`;
            }
         } catch (parseError) {
            console.warn('Failed to parse error response:', parseError);
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
         throw new Error(errorMessage);
      }
      return res.json();
   }, {
      onSuccess: async (data) => {
         console.log('Domain Added!!!', data);
         const newDomain:DomainType[] = data.domains;
         const singleDomain = newDomain.length === 1;
         toast(`${singleDomain ? newDomain[0].domain : `${newDomain.length} domains`} Added Successfully!`, { icon: '✔️' });
         onSuccess(false);
         if (singleDomain) {
            router.push(`/domain/${newDomain[0].slug}`);
         }
         queryClient.invalidateQueries(['domains']);
      },
      onError: () => {
         console.log('Error Adding New Domain!!!');
         toast('Error Adding New Domain');
      },
   });
}

export function useUpdateDomain(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(updateDomainRequest, {
      onSuccess: async () => {
         console.log('Settings Updated!!!');
         toast('Settings Updated!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries({ queryKey: ['domains'] });
         queryClient.invalidateQueries({ queryKey: ['domain'] });
      },
      onError: (error) => {
         console.log('Error Updating Domain Settings!!!', error);
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
      const res = await fetch(`${window.location.origin}/api/domains?domain=${domain.domain}`, { method: 'DELETE' });
      if (res.status >= 400 && res.status < 600) {
         let errorMessage = 'Bad response from server';
         try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
               const errorData = await res.json();
               errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
            } else {
               // Handle HTML error pages or other non-JSON responses
               const textResponse = await res.text();
               console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
               errorMessage = `Server error (${res.status}): Please try again later`;
            }
         } catch (parseError) {
            console.warn('Failed to parse error response:', parseError);
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
         throw new Error(errorMessage);
      }
      return res.json();
   }, {
      onSuccess: async () => {
         toast('Domain Removed Successfully!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries(['domains']);
      },
      onError: () => {
         console.log('Error Removing Domain!!!');
         toast('Error Removing Domain', { icon: '⚠️' });
      },
   });
}
