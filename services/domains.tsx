import { useRouter, NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import apiFetch from './apiClient';

type UpdatePayload = {
   domainSettings: DomainSettings,
   domain: DomainType
}

export async function fetchDomains(router: NextRouter, withStats:boolean): Promise<{domains: DomainType[]}> {
   try {
      return await apiFetch(`${window.location.origin}/api/domains${withStats ? '?withstats=true' : ''}`);
   } catch (error: any) {
      if (error.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw error;
   }
}

export async function fetchDomain(router: NextRouter, domainName: string): Promise<{domain: DomainType}> {
   if (!domainName) { throw new Error('No Domain Name Provided!'); }
   try {
      return await apiFetch(`${window.location.origin}/api/domain?domain=${domainName}`);
   } catch (error: any) {
      if (error.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw error;
   }
}

export async function fetchDomainScreenshot(domain: string, forceFetch = false): Promise<string | false> {
   if (typeof window === 'undefined' || !globalThis.localStorage) { return false; }
   const domainThumbsRaw = localStorage.getItem('domainThumbs');
   let domThumbs: Record<string, string> = {};
   if (domainThumbsRaw) {
      try {
         domThumbs = JSON.parse(domainThumbsRaw);
      } catch (err) {
         domThumbs = {};
      }
   }
   if (!domThumbs[domain] || forceFetch) {
      try {
         const screenshotURL = `https://image.thum.io/get/width/200/https://${domain}`;
         const domainImageRes = await fetch(screenshotURL);
         const domainImageBlob = domainImageRes.status === 200 ? await domainImageRes.blob() : false;
         if (domainImageBlob) {
            try {
               const reader = new FileReader();
               await new Promise((resolve, reject) => {
                  reader.onload = resolve;
                  reader.onerror = reject;
                  reader.readAsDataURL(domainImageBlob);
               });
               const imageBase: string = typeof reader.result === 'string' ? reader.result : '';
               localStorage.setItem('domainThumbs', JSON.stringify({ ...domThumbs, [domain]: imageBase }));
               return imageBase;
            } catch (err) {
               return false;
            }
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
      onSuccess: async (data) => {
         console.log('Domain Loaded!!!', data.domain);
         onSuccess(data.domain);
      } });
}

export function useAddDomain(onSuccess:Function) {
   const router = useRouter();
   const queryClient = useQueryClient();
   return useMutation(async (domains:string[]) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ domains }) };
      return apiFetch(`${window.location.origin}/api/domains`, fetchOpts);
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
         queryClient.invalidateQueries({ queryKey: ['domains'] });
      },
      onError: () => {
         console.log('Error Adding New Domain!!!');
         toast('Error Adding New Domain');
      },
   });
}

export function useUpdateDomain(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async ({ domainSettings, domain }: UpdatePayload) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify(domainSettings) };
      return apiFetch(`${window.location.origin}/api/domains?domain=${domain.domain}`, fetchOpts);
   }, {
      onSuccess: async () => {
         console.log('Settings Updated!!!');
         toast('Settings Updated!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries({ queryKey: ['domains'] });
      },
      onError: (error) => {
         console.log('Error Updating Domain Settings!!!', error);
         toast('Error Updating Domain Settings', { icon: '⚠️' });
      },
   });
}

export function useDeleteDomain(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async (domain:DomainType) => {
      return apiFetch(`${window.location.origin}/api/domains?domain=${domain.domain}`, { method: 'DELETE' });
   }, {
      onSuccess: async () => {
         toast('Domain Removed Successfully!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries({ queryKey: ['domains'] });
      },
      onError: () => {
         console.log('Error Removing Domain!!!');
         toast('Error Removing Domain', { icon: '⚠️' });
      },
   });
}
