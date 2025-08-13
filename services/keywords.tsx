import toast from 'react-hot-toast';
import { NextRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import apiFetch from './apiClient';

export const fetchKeywords = async (
   router: NextRouter,
   domain: string,
): Promise<{ keywords: KeywordType[] }> => {
   if (!domain) { return { keywords: [] }; }
   return apiFetch(`${window.location.origin}/api/keywords?domain=${domain}`);
};

export function useFetchKeywords(
   router: NextRouter,
   domain: string,
   setKeywordSPollInterval?:Function,
   keywordSPollInterval:undefined|number = undefined,
) {
   const { data: keywordsData, isLoading: keywordsLoading, isError } = useQuery(
      ['keywords', domain],
      () => fetchKeywords(router, domain),
      {
         refetchInterval: keywordSPollInterval,
         onSuccess: (data) => {
            // If Keywords are Manually Refreshed check if the any of the keywords position are still being fetched
            // If yes, then refecth the keywords every 5 seconds until all the keywords position is updated by the server
            if (data.keywords && data.keywords.length > 0 && setKeywordSPollInterval) {
               const hasRefreshingKeyword = data.keywords.some((x:KeywordType) => x.updating);
               if (hasRefreshingKeyword) {
                  setKeywordSPollInterval(5000);
               } else {
                  if (keywordSPollInterval) {
                     toast('Keywords Refreshed!', { icon: '✔️' });
                  }
                  setKeywordSPollInterval(undefined);
               }
            }
         },
      },
   );
   return { keywordsData, keywordsLoading, isError };
}

export function useAddKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async (keywords:KeywordAddPayload[]) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ keywords }) };
      return apiFetch(`${window.location.origin}/api/keywords`, fetchOpts);
   }, {
      onSuccess: async () => {
         console.log('Keywords Added!!!');
         toast('Keywords Added Successfully!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries({ queryKey: ['keywords'] });
      },
      onError: () => {
         console.log('Error Adding New Keywords!!!');
         toast('Error Adding New Keywords', { icon: '⚠️' });
      },
   });
}

export function useDeleteKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async (keywordIDs:number[]) => {
      const keywordIds = keywordIDs.join(',');
      return apiFetch(`${window.location.origin}/api/keywords?id=${keywordIds}`, { method: 'DELETE' });
   }, {
      onSuccess: async () => {
         console.log('Removed Keyword!!!');
         onSuccess();
         toast('Keywords Removed Successfully!', { icon: '✔️' });
         queryClient.invalidateQueries({ queryKey: ['keywords'] });
      },
      onError: () => {
         console.log('Error Removing Keyword!!!');
         toast('Error Removing the Keywords', { icon: '⚠️' });
      },
   });
}

export function useFavKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async ({ keywordID, sticky }:{keywordID:number, sticky:boolean}) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify({ sticky }) };
      return apiFetch(`${window.location.origin}/api/keywords?id=${keywordID}`, fetchOpts);
   }, {
      onSuccess: async (data) => {
         onSuccess();
         const isSticky = data.keywords[0] && data.keywords[0].sticky;
         toast(isSticky ? 'Keywords Made Favorite!' : 'Keywords Unfavorited!', { icon: '✔️' });
         queryClient.invalidateQueries({ queryKey: ['keywords'] });
      },
      onError: () => {
         console.log('Error Changing Favorite Status!!!');
         toast('Error Changing Favorite Status.', { icon: '⚠️' });
      },
   });
}

export function useUpdateKeywordTags(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async ({ tags }:{tags:{ [ID:number]: string[] }}) => {
      const keywordIds = Object.keys(tags).join(',');
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify({ tags }) };
      return apiFetch(`${window.location.origin}/api/keywords?id=${keywordIds}`, fetchOpts);
   }, {
      onSuccess: async () => {
         onSuccess();
         toast('Keyword Tags Updated!', { icon: '✔️' });
         queryClient.invalidateQueries({ queryKey: ['keywords'] });
      },
      onError: () => {
         console.log('Error Updating Keyword Tags!!!');
         toast('Error Updating Keyword Tags.', { icon: '⚠️' });
      },
   });
}

export function useRefreshKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async ({ ids = [], domain = '' } : {ids?: number[], domain?: string}) => {
      const keywordIds = ids.join(',');
      console.log(keywordIds);
      const query = ids.length === 0 && domain ? `?id=all&domain=${domain}` : `?id=${keywordIds}`;
      return apiFetch(`${window.location.origin}/api/refresh${query}`, { method: 'POST' });
   }, {
      onSuccess: async () => {
         console.log('Keywords Added to Refresh Queue!!!');
         onSuccess();
         toast('Keywords Added to Refresh Queue', { icon: '🔄' });
         queryClient.invalidateQueries({ queryKey: ['keywords'] });
      },
      onError: () => {
         console.log('Error Refreshing Keywords!!!');
         toast('Error Refreshing Keywords.', { icon: '⚠️' });
      },
   });
}

export function useFetchSingleKeyword(keywordID:number) {
   return useQuery(['keyword', keywordID], async () => {
      const fetchURL = `${window.location.origin}/api/keyword?id=${keywordID}`;
      const res = await apiFetch(fetchURL);
      return { history: res.keyword.history || [], searchResult: res.keyword.lastResult || [] };
   }, {
      onError: () => {
         console.log('Error Loading Keyword Data!!!');
         toast('Error Loading Keyword Details.', { icon: '⚠️' });
      },
   });
}

export async function fetchSearchResults(router:NextRouter, keywordData: Record<string, string>) {
   const { keyword, country, device } = keywordData;
   try {
      return await apiFetch(`${window.location.origin}/api/refresh?keyword=${keyword}&country=${country}&device=${device}`, { method: 'GET' });
   } catch (error: any) {
      if (error.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      throw error;
   }
}
