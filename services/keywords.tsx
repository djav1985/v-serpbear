import toast from 'react-hot-toast';
import { NextRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { normalizeToBoolean } from '../utils/dbBooleans';
import { apiFetch, apiGet, apiPost, apiPut } from '../utils/client/apiClient';
import { getAddKeywordsMessage, getLocationUpdateMessage } from '../utils/keywordMeta';

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
   const data = await apiGet<KeywordsResponse>(`/api/keywords?domain=${encodeURIComponent(domain)}`, router);
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
   setKeywordSPollInterval?: (interval: number | undefined) => void,
   keywordSPollInterval:undefined|number = undefined,
) {
   const { data: keywordsData, isLoading: keywordsLoading, isError } = useQuery(
      ['keywords', domain],
      () => fetchKeywords(router, domain),
      {
         // Only poll while a manual refresh is in progress AND the list still has an updating keyword.
         enabled: !!domain,
         refetchInterval: (data) => (
            keywordSPollInterval && data?.keywords?.some((x: KeywordType) => x.updating) ? keywordSPollInterval : false
         ),
         refetchIntervalInBackground: false,
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

export function useAddKeywords(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async ({ payloads }: { payloads: KeywordAddPayload[], skipped?: string[] }) => (
      // Nothing left to add (everything was already tracked): skip the request and only report
      payloads.length > 0 ? apiPost('/api/keywords', { keywords: payloads }) : null
   ), {
      onSuccess: async (_data, { payloads, skipped = [] }) => {
         const message = getAddKeywordsMessage(payloads.length, skipped);
         toast(message, { icon: skipped.length > 0 ? '⚠️' : '✔️' });
         onSuccess();
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Adding New Keywords', { icon: '⚠️' });
      },
   });
}

export function useDeleteKeywords(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async (keywordIDs:number[]) => (
      // IDs travel in the JSON body, so a large selection cannot overflow the URL length
      apiFetch('/api/keywords', { method: 'DELETE', body: JSON.stringify({ ids: keywordIDs }) })
   ), {
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

export function useFavKeywords(onSuccess: () => void) {
   const queryClient = useQueryClient();
   // keywordID is one ID (row menu) or a list (bulk menu); the API takes a comma separated list
   return useMutation(async ({ keywordID, sticky }:{keywordID:number | number[], sticky:boolean}) => (
      apiPut<{ keywords: KeywordType[] }>(`/api/keywords?id=${[keywordID].flat().join(',')}`, { sticky })
   ), {
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

export function useUpdateKeywordTags(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async ({ tags }:{tags:{ [ID:number]: string[] }}) => {
      const ids = Object.keys(tags).map(Number);
      return apiPut('/api/keywords', { ids, tags });
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

export function useUpdateKeywordLocation(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async ({ keywordIDs, location, country }:{keywordIDs: number[], location: string, country: string}) => (
      apiPut<{ updatedCount?: number, skipped?: string[] }>('/api/keywords', { ids: keywordIDs, location, country })
   ), {
      onSuccess: async (data) => {
         onSuccess();
         const skipped = data?.skipped || [];
         toast(getLocationUpdateMessage(data?.updatedCount ?? 0, skipped), { icon: skipped.length > 0 ? '⚠️' : '✔️' });
         queryClient.invalidateQueries(['keywords']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Updating Keyword Locations.', { icon: '⚠️' });
      },
   });
}

export function useRefreshKeywords(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async ({ ids = [], domain = '' } : {ids?: number[], domain?: string}) => (
      // Refreshing a whole domain has no ID list, so it keeps the query form; selected IDs go in the body
      ids.length === 0 && domain
         ? apiPost(`/api/refresh?id=all&domain=${encodeURIComponent(domain)}`, {})
         : apiPost('/api/refresh', { ids })
   ), {
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
      const result = await apiGet<{ keyword?: Record<string, unknown> }>(`/api/keyword?id=${keywordID}`);
      return {
         history: (result.keyword?.history || {}) as KeywordHistory,
         searchResult: result.keyword?.lastResult || [],
         localResults: result.keyword?.localResults || [],
         mapPackTop3: normalizeToBoolean(result.keyword?.mapPackTop3),
         mapPackRemovedAt: typeof result.keyword?.mapPackRemovedAt === 'string' ? result.keyword.mapPackRemovedAt : null,
      };
   }, {
      onError: (_error) => {
         toast('Error Loading Keyword Details.', { icon: '⚠️' });
      },
   });
}

export type SearchResultsResponse = {
   searchResult: {
      results: KeywordLastResult[],
      keyword: string,
      position: number,
      country: string,
      device: string
   }
};

export async function fetchSearchResults(router:NextRouter, keywordData: Record<string, string>): Promise<SearchResultsResponse | null> {
   const { keyword, country, device } = keywordData;
   const params = new URLSearchParams();
   if (typeof keyword === 'string') { params.set('keyword', keyword); }
   if (typeof country === 'string') { params.set('country', country); }
   if (typeof device === 'string') { params.set('device', device); }
   const queryString = params.toString();
   return apiGet<SearchResultsResponse>(`/api/refresh${queryString ? `?${queryString}` : ''}`, router);
}
