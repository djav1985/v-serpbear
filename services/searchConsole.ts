import { NextRouter } from 'next/router';
import { useQuery } from 'react-query';
import apiFetch from './apiClient';

export async function fetchSCKeywords(router: NextRouter) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   try {
      return await apiFetch(`${window.location.origin}/api/searchconsole?domain=${router.query.slug}`);
   } catch (error: any) {
      if (error.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw error;
   }
}

export function useFetchSCKeywords(router: NextRouter, domainLoaded: boolean = false) {
   // console.log('ROUTER: ', router);
   return useQuery('sckeywords', () => router.query.slug && fetchSCKeywords(router), { enabled: domainLoaded });
}

export async function fetchSCInsight(router: NextRouter) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   try {
      return await apiFetch(`${window.location.origin}/api/insight?domain=${router.query.slug}`);
   } catch (error: any) {
      if (error.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw error;
   }
}

export function useFetchSCInsight(router: NextRouter, domainLoaded: boolean = false) {
   // console.log('ROUTER: ', router);
   return useQuery('scinsight', () => router.query.slug && fetchSCInsight(router), { enabled: domainLoaded });
}
