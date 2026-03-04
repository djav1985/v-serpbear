import toast from 'react-hot-toast';
import { NextRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { normalizeToBoolean } from '../utils/dbBooleans';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/client/apiClient';

type KeywordsResponse = {
   keywords?: KeywordType[]
   [key: string]: unknown,
};

const normaliseKeywordFlags = (keyword: unknown): KeywordType => {
   if (typeof keyword !== 'object' || keyword === null) {
      throw new Error('Invalid keyword object');
   }
   const keywordRecord = keyword as Record<string, unknown>;
   return {
      ...keywordRecord,
      updating: normalizeToBoolean(keywordRecord.updating),
      sticky: normalizeToBoolean(keywordRecord.sticky),
      mapPackTop3: normalizeToBoolean(keywordRecord.mapPackTop3),
   } as KeywordType;
};

export const fetchKeywords = async (router: NextRouter, domain: string) => {
   if (!domain) { return { keywords: [] }; }
   const data = await apiGet<KeywordsResponse>(`/api/keywords?domain=${domain}`, router);
   if (!data || typeof data !== 'object') { return data; }
   if (!Array.isArray(data.keywords)) { return data; }
   return {
      ...data,
      keywords: data.keywords.map((keyword) => normaliseKeywordFlags(keyword)),
   };
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
         refetchIntervalInBackground: true,
         staleTime: 0, // Always fetch fresh data, don't use stale cache
         cacheTime: 1000, // Keep a very short cache to avoid duplicate requests on quick remounts
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
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/keywords`, fetchOpts);
      await throwOnError(res);
      return res.json();
   }, {
      onSuccess: async () => {
         toast('Keywords Added Successfully!', { icon: '✔️' });
         onSuccess();
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Adding New Keywords', { icon: '⚠️' });
      },
   });
}

export function useDeleteKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async (keywordIDs:number[]) => {
      const keywordIds = keywordIDs.join(',');
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/keywords?id=${keywordIds}`, { method: 'DELETE' });
      await throwOnError(res);
      return res.json();
   }, {
      onSuccess: async () => {
         onSuccess();
         toast('Keywords Removed Successfully!', { icon: '✔️' });
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Removing the Keywords', { icon: '⚠️' });
      },
   });
}

export function useFavKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async ({ keywordID, sticky }:{keywordID:number, sticky:boolean}) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify({ sticky }) };
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/keywords?id=${keywordID}`, fetchOpts);
      await throwOnError(res);
      return res.json();
   }, {
      onSuccess: async (data) => {
         onSuccess();
         const isSticky = data.keywords[0]?.sticky === true;
         toast(isSticky ? 'Keywords Made Favorite!' : 'Keywords Unfavorited!', { icon: '✔️' });
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (_error, _variables, _context) => {
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
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/keywords?id=${keywordIds}`, fetchOpts);
      await throwOnError(res);
      return res.json();
   }, {
      onSuccess: async () => {
         onSuccess();
         toast('Keyword Tags Updated!', { icon: '✔️' });
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Updating Keyword Tags.', { icon: '⚠️' });
      },
   });
}

export function useRefreshKeywords(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation(async ({ ids = [], domain = '' } : {ids?: number[], domain?: string}) => {
      const keywordIds = ids.join(',');
      const origin = getClientOrigin();
      const query = ids.length === 0 && domain ? `?id=all&domain=${encodeURIComponent(domain)}` : `?id=${keywordIds}`;
      const res = await fetch(`${origin}/api/refresh${query}`, { method: 'POST' });
      await throwOnError(res);
      return res.json();
   }, {
      onSuccess: async () => {
         onSuccess();
         toast('Keywords Added to Refresh Queue', { icon: '🔄' });
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (error, _variables, _context) => {
         const message = (error as Error)?.message || 'Error Refreshing Keywords.';
         toast(message, { icon: '⚠️' });
      },
   });
}

export function useFetchSingleKeyword(keywordID:number) {
   return useQuery(['keyword', keywordID], async () => {
      try {
         const origin = getClientOrigin();
         const fetchURL = `${origin}/api/keyword?id=${keywordID}`;
         const res = await fetch(fetchURL, { method: 'GET' });
         await throwOnError(res);
         const result = await res.json();
         return { 
            history: result.keyword?.history || [], 
            searchResult: result.keyword?.lastResult || [], 
            localResults: result.keyword?.localResults || [],
            mapPackTop3: normalizeToBoolean(result.keyword?.mapPackTop3),
         };
      } catch (error) {
         if (error instanceof Error && error.message !== 'Error Loading Keyword Details') {
            throw error;
         }
         throw new Error('Error Loading Keyword Details');
      }
   }, {
      onError: (_error) => {
         toast('Error Loading Keyword Details.', { icon: '⚠️' });
      },
   });
}

export async function fetchSearchResults(router:NextRouter, keywordData: Record<string, string>) {
   const { keyword, country, device } = keywordData;
   const origin = getClientOrigin();
   const params = new URLSearchParams();
   if (typeof keyword === 'string') { params.set('keyword', keyword); }
   if (typeof country === 'string') { params.set('country', country); }
   if (typeof device === 'string') { params.set('device', device); }
   const queryString = params.toString();
   const res = await fetch(`${origin}/api/refresh${queryString ? `?${queryString}` : ''}`, { method: 'GET' });
   await throwOnError(res, router);
   return res.json();
}
