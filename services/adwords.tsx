import { NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { apiGet, apiPost, apiPut } from '../utils/client/apiClient';

export function useTestAdwordsIntegration(onSuccess?: (show?: boolean) => void) {
   return useMutation(async (payload:{developer_token:string, account_id:string}) => (
      apiPost('/api/adwords', { ...payload })
   ), {
      onSuccess: async (_data) => {
         toast('Google Ads has been integrated successfully!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
      },
      onError: (_error, _variables, _context) => {
         toast('Failed to connect to Google Ads. Please make sure you have provided the correct API info.', { icon: '⚠️' });
      },
   });
}

export async function fetchAdwordsKeywordIdeas(router: NextRouter, domainSlug: string) {
   return apiGet<{ data: { keywords: IdeaKeyword[], favorites: IdeaKeyword[], settings: DomainIdeasSettings } }>(`/api/ideas?domain=${domainSlug}`, router);
}

// React hook; should be used within a React component or another hook
export function useFetchKeywordIdeas(router: NextRouter, _adwordsConnected = false) {
   const isResearch = router.pathname === '/research';
   const domainSlug = isResearch ? 'research' : (router.query.slug as string);
   const enabled = !!domainSlug && _adwordsConnected;
   return useQuery(
      `keywordIdeas-${domainSlug}`,
      () => fetchAdwordsKeywordIdeas(router, domainSlug),
      { enabled, retry: false },
   );
}

// React hook; should be used within a React component or another hook
export function useMutateKeywordIdeas(router:NextRouter, onSuccess?: (show?: boolean) => void) {
   const queryClient = useQueryClient();
   const domainSlug = router.pathname === '/research' ? 'research' : router.query.slug as string;
   return useMutation(async (data:Record<string, any>) => (
      apiPost('/api/ideas', { ...data }, router)
   ), {
      onSuccess: async (_data) => {
         toast('Keyword Ideas Loaded Successfully!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
         queryClient.invalidateQueries(`keywordIdeas-${domainSlug}`);
      },
      onError: (error, _variables, _context) => {
         const message = (error as Error)?.message || 'Error Loading Keyword Ideas';
         toast(message, { icon: '⚠️' });
      },
   });
}

export function useMutateFavKeywordIdeas(router:NextRouter, onSuccess?: (show?: boolean) => void) {
   const queryClient = useQueryClient();
   const domainSlug = router.pathname === '/research' ? 'research' : router.query.slug as string;
   return useMutation(async (payload:Record<string, any>) => (
      apiPut('/api/ideas', { ...payload }, router)
   ), {
      onSuccess: async (_data) => {
         // toast('Keyword Updated!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
         queryClient.invalidateQueries(`keywordIdeas-${domainSlug}`);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Favorating Keywords', { icon: '⚠️' });
      },
   });
}

export function useMutateKeywordsVolume(onSuccess?: (show?: boolean) => void) {
   return useMutation(async (data:Record<string, any>) => (
      apiPost('/api/volume', { ...data })
   ), {
      onSuccess: async (_data) => {
         toast('Keyword Volume Data Loaded Successfully! Reloading Page...', { icon: '✔️' });
         if (onSuccess) {
            onSuccess(false);
         }
         setTimeout(() => {
            window.location.reload();
         }, 3000);
      },
      onError: (error, _variables, _context) => {
         const message = (error as Error)?.message || 'Error Loading Keyword Volume Data';
         toast(message, { icon: '⚠️' });
      },
   });
}
