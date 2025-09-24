import { NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useQuery } from 'react-query';

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
   const res = await fetch(`${window.location.origin}/api/searchconsole?domain=${slug}`, { method: 'GET' });
   if (res.status >= 400 && res.status < 600) {
      if (res.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw new Error('Bad response from server');
   }
   return res.json();
}

export function useFetchSCKeywords(router: NextRouter, domainLoaded: boolean = false) {
   // console.log('ROUTER: ', router);
   const slug = getActiveSlug(router) || '';
   return useQuery(['sckeywords', slug], () => fetchSCKeywords(router, slug), { enabled: domainLoaded && !!slug });
}

export async function fetchSCInsight(router: NextRouter, slugOverride?: string) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   const slug = slugOverride ?? getActiveSlug(router);
   if (!slug) {
      return null;
   }
   const res = await fetch(`${window.location.origin}/api/insight?domain=${slug}`, { method: 'GET' });
   if (res.status >= 400 && res.status < 600) {
      if (res.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw new Error('Bad response from server');
   }
   return res.json();
}

export function useFetchSCInsight(router: NextRouter, domainLoaded: boolean = false) {
   // console.log('ROUTER: ', router);
   const slug = getActiveSlug(router) || '';
   return useQuery(['scinsight', slug], () => fetchSCInsight(router, slug), { enabled: domainLoaded && !!slug });
}

export const refreshSearchConsoleData = async () => {
   try {
      const res = await fetch(`${window.location.origin}/api/searchconsole`, { method: 'POST' });
      if (res.status >= 400 && res.status < 600) {
         throw new Error('Bad response from server');
      }
      toast('Search Console Data Refreshed!', { icon: '✔️' });
      return res.json();
   } catch (error) {
      console.log('Error Refreshing Search Console Data!!!', error);
      toast('Error Refreshing Search Console Data', { icon: '⚠️' });
      throw error;
   }
};
