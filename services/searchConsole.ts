import { NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useQuery } from 'react-query';
import { getClientOrigin } from '../utils/client/origin';
import { throwOnError } from '../utils/client/fetchWithError';

const getActiveSlug = (router: NextRouter): string | undefined => {
   const slugParam = router?.query?.slug;
   if (Array.isArray(slugParam)) {
      return slugParam[0];
   }
   return slugParam;
};

export async function fetchSCKeywords(router: NextRouter, slugOverride?: string) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   const slug = slugOverride ?? getActiveSlug(router);
   if (!slug) {
      return null;
   }
   const origin = getClientOrigin();
   const res = await fetch(`${origin}/api/searchconsole?domain=${slug}`, { method: 'GET' });
   await throwOnError(res, router);
   return res.json();
}

export function useFetchSCKeywords(router: NextRouter, domainLoaded: boolean = false, domainHasCredentials: boolean = false) {
   const slug = getActiveSlug(router) || '';
   const enabled = !!slug && (domainLoaded || domainHasCredentials);
   return useQuery(['sckeywords', slug], () => fetchSCKeywords(router, slug), { enabled });
}

export async function fetchSCInsight(router: NextRouter, slugOverride?: string) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   const slug = slugOverride ?? getActiveSlug(router);
   if (!slug) {
      return null;
   }
   const origin = getClientOrigin();
   const res = await fetch(`${origin}/api/insight?domain=${slug}`, { method: 'GET' });
   await throwOnError(res, router);
   return res.json();
}

export function useFetchSCInsight(router: NextRouter, domainLoaded: boolean = false, domainHasCredentials: boolean = false) {
   const slug = getActiveSlug(router) || '';
   const enabled = !!slug && (domainLoaded || domainHasCredentials);
   return useQuery(['scinsight', slug], () => fetchSCInsight(router, slug), { enabled });
}

export const refreshSearchConsoleData = async () => {
   try {
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/searchconsole`, { method: 'POST' });
      await throwOnError(res);
      toast('Search Console Data Refreshed!', { icon: '✔️' });
      return res.json();
   } catch (error) {
      toast('Error Refreshing Search Console Data', { icon: '⚠️' });
      throw error;
   }
};
