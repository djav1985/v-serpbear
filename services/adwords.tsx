import { NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import apiFetch from './apiClient';

export function useTestAdwordsIntegration(onSuccess?: Function) {
   return useMutation(async (payload:{developer_token:string, account_id:string}) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ ...payload }) };
      return apiFetch(`${window.location.origin}/api/adwords`, fetchOpts);
   }, {
      onSuccess: async (data) => {
         console.log('Ideas Added:', data);
         toast('Google Ads has been integrated successfully!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
      },
      onError: (error) => {
         console.log('Error Loading Keyword Ideas!!!', error);
         toast('Failed to connect to Google Ads. Please make sure you have provided the correct API info.', { icon: '⚠️' });
      },
   });
}

export async function fetchAdwordsKeywordIdeas(router: NextRouter, domainSlug: string) {
   // if (!router.query.slug) { throw new Error('Invalid Domain Name'); }
   try {
      return await apiFetch(`${window.location.origin}/api/ideas?domain=${domainSlug}`);
   } catch (error: any) {
      if (error.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw error;
   }
}

// React hook; should be used within a React component or another hook
export function useFetchKeywordIdeas(router: NextRouter, adwordsConnected = false) {
   const isResearch = router.pathname === '/research';
   const domainSlug = isResearch ? 'research' : (router.query.slug as string);
   const enabled = !!(adwordsConnected && domainSlug);
   return useQuery(`keywordIdeas-${domainSlug}`, () => domainSlug && fetchAdwordsKeywordIdeas(router, domainSlug), { enabled, retry: false });
}

// React hook; should be used within a React component or another hook
export function useMutateKeywordIdeas(router:NextRouter, onSuccess?: Function) {
   const queryClient = useQueryClient();
   const domainSlug = router.pathname === '/research' ? 'research' : router.query.slug as string;
   return useMutation(async (data:Record<string, any>) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ ...data }) };
      return apiFetch(`${window.location.origin}/api/ideas`, fetchOpts);
   }, {
      onSuccess: async (data) => {
         console.log('Ideas Added:', data);
         toast('Keyword Ideas Loaded Successfully!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
         queryClient.invalidateQueries([`keywordIdeas-${domainSlug}`]);
      },
      onError: (error) => {
         console.log('Error Loading Keyword Ideas!!!', error);
         const message = (error as Error)?.message || 'Error Loading Keyword Ideas';
         toast(message, { icon: '⚠️' });
      },
   });
}

export function useMutateFavKeywordIdeas(router:NextRouter, onSuccess?: Function) {
   const queryClient = useQueryClient();
   const domainSlug = router.pathname === '/research' ? 'research' : router.query.slug as string;
   return useMutation(async (payload:Record<string, any>) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify({ ...payload }) };
      return apiFetch(`${window.location.origin}/api/ideas`, fetchOpts);
   }, {
      onSuccess: async (data) => {
         console.log('Ideas Added:', data);
         // toast('Keyword Updated!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
         queryClient.invalidateQueries([`keywordIdeas-${domainSlug}`]);
      },
      onError: (error) => {
         console.log('Error Favorating Keywords', error);
         toast('Error Favorating Keywords', { icon: '⚠️' });
      },
   });
}

export function useMutateKeywordsVolume(onSuccess?: Function) {
   return useMutation(async (data:Record<string, any>) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ ...data }) };
      return apiFetch(`${window.location.origin}/api/volume`, fetchOpts);
   }, {
      onSuccess: async (data) => {
         toast('Keyword Volume Data Loaded Successfully! Reloading Page...', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
        setTimeout(() => {
         window.location.reload();
        }, 3000);
      },
      onError: (error) => {
         console.log('Error Loading Keyword Volume Data!!!', error);
         toast('Error Loading Keyword Volume Data', { icon: '⚠️' });
      },
   });
}
