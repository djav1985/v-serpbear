import { NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useQuery } from 'react-query';
import { apiGet, apiPost } from '../utils/client/apiClient';
import { showQueryErrorToast } from './queryErrorToast';

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
   return apiGet<{ data: SCDomainDataType }>(`/api/searchconsole?domain=${encodeURIComponent(slug)}`, router);
}

export function useFetchSCKeywords(router: NextRouter, domainLoaded: boolean = false, domainHasCredentials: boolean = false) {
   const slug = getActiveSlug(router) || '';
   const enabled = !!slug && (domainLoaded || domainHasCredentials);
   return useQuery(['sckeywords', slug], () => fetchSCKeywords(router, slug), {
      enabled,
      onError: (error) => showQueryErrorToast(error, 'Error Loading Search Console Keywords.', 'sc-keywords-load-error'),
   });
}

export async function fetchSCInsight(router: NextRouter, slugOverride?: string) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   const slug = slugOverride ?? getActiveSlug(router);
   if (!slug) {
      return null;
   }
   return apiGet<{ data: InsightDataType }>(`/api/insight?domain=${encodeURIComponent(slug)}`, router);
}

export function useFetchSCInsight(router: NextRouter, domainLoaded: boolean = false, domainHasCredentials: boolean = false) {
   const slug = getActiveSlug(router) || '';
   const enabled = !!slug && (domainLoaded || domainHasCredentials);
   return useQuery(['scinsight', slug], () => fetchSCInsight(router, slug), {
      enabled,
      onError: (error) => showQueryErrorToast(error, 'Error Loading Search Console Insights.', 'sc-insight-load-error'),
   });
}

export const refreshSearchConsoleData = async () => {
   try {
      const result = await apiPost('/api/searchconsole', {});
      toast('Search Console Data Refreshed!', { icon: '✔️' });
      return result;
   } catch (error) {
      toast('Error Refreshing Search Console Data', { icon: '⚠️' });
      throw error;
   }
};
