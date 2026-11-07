'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { normalizeToBoolean } from 'utils/dbBooleans';
import { normalizeKeyword } from './keyword-normalize';
import { apiFetch, apiGet, apiPost, apiPut } from 'utils/client/apiClient';
import { getAddKeywordsMessage, getLocationUpdateMessage } from 'utils/keywordMeta';

const POLL_WHILE_UPDATING_MS = 5000;

export const keywordsKey = (domain: string) => ['keywords', domain] as const;
export const settingsKey = ['settings'] as const;

/** Same shape the server page seeds, so server and browser reads agree. */
export const fetchKeywords = async (domain: string): Promise<KeywordType[]> => {
   if (!domain) { return []; }
   const data = await apiGet<{ keywords?: unknown[] }>(`/api/serp/keywords?domain=${encodeURIComponent(domain)}`);
   return Array.isArray(data?.keywords) ? data.keywords.map(normalizeKeyword) : [];
};

/**
 * The domain's keywords. While any keyword is still being refreshed by the server the list is re-read every
 * 5 seconds, and a toast says so once the last one finishes.
 */
export function useKeywords(domain: string, initialKeywords: KeywordType[] | undefined) {
   const query = useQuery({
      queryKey: keywordsKey(domain),
      queryFn: () => fetchKeywords(domain),
      initialData: initialKeywords,
      enabled: !!domain,
      refetchInterval: (current) => (current.state.data?.some((k) => k.updating) ? POLL_WHILE_UPDATING_MS : false),
      refetchIntervalInBackground: false,
   });

   const wasUpdating = useRef(false);
   const isUpdating = !!query.data?.some((k) => k.updating);
   useEffect(() => {
      if (wasUpdating.current && !isUpdating) { toast.success('Keywords refreshed!'); }
      wasUpdating.current = isUpdating;
   }, [isUpdating]);

   return query;
}

const useKeywordsInvalidator = () => {
   const queryClient = useQueryClient();
   return () => queryClient.invalidateQueries({ queryKey: ['keywords'] });
};

export function useAddKeywords(onDone: () => void) {
   const invalidate = useKeywordsInvalidator();
   return useMutation({
      // Nothing left to add (everything was already tracked): skip the request and only report.
      mutationFn: ({ payloads }: { payloads: KeywordAddPayload[]; skipped?: string[] }) => (
         payloads.length > 0 ? apiPost('/api/serp/keywords', { keywords: payloads }) : Promise.resolve(null)
      ),
      onSuccess: (_data, { payloads, skipped = [] }) => {
         const message = getAddKeywordsMessage(payloads.length, skipped);
         if (skipped.length > 0) { toast.warning(message); } else { toast.success(message); }
         onDone();
         invalidate();
      },
      onError: () => { toast.error('Error adding new keywords'); },
   });
}

export function useDeleteKeywords(onDone: () => void) {
   const invalidate = useKeywordsInvalidator();
   return useMutation({
      // IDs travel in the JSON body, so a large selection cannot overflow the URL length.
      mutationFn: (ids: number[]) => apiFetch('/api/serp/keywords', { method: 'DELETE', body: JSON.stringify({ ids }) }),
      onSuccess: () => { onDone(); toast.success('Keywords removed successfully!'); invalidate(); },
      onError: () => { toast.error('Error removing the keywords'); },
   });
}

export function useFavoriteKeyword() {
   const invalidate = useKeywordsInvalidator();
   return useMutation({
      mutationFn: ({ keywordID, sticky }: { keywordID: number; sticky: boolean }) => (
         apiPut<{ keywords: KeywordType[] }>(`/api/serp/keywords?id=${keywordID}`, { sticky })
      ),
      onSuccess: (data) => {
         toast.success(data.keywords[0]?.sticky === true ? 'Keyword made favorite!' : 'Keyword unfavorited!');
         invalidate();
      },
      onError: () => { toast.error('Error changing favorite status.'); },
   });
}

export function useUpdateKeywordTags(onDone: () => void) {
   const invalidate = useKeywordsInvalidator();
   return useMutation({
      mutationFn: ({ tags }: { tags: { [ID: number]: string[] } }) => (
         apiPut('/api/serp/keywords', { ids: Object.keys(tags).map(Number), tags })
      ),
      onSuccess: () => { onDone(); toast.success('Keyword tags updated!'); invalidate(); },
      onError: () => { toast.error('Error updating keyword tags.'); },
   });
}

export function useUpdateKeywordLocation(onDone: () => void) {
   const invalidate = useKeywordsInvalidator();
   return useMutation({
      mutationFn: ({ keywordIDs, location, country }: { keywordIDs: number[]; location: string; country: string }) => (
         apiPut<{ updatedCount?: number; skipped?: string[] }>('/api/serp/keywords', { ids: keywordIDs, location, country })
      ),
      onSuccess: (data) => {
         onDone();
         const skipped = data?.skipped || [];
         const message = getLocationUpdateMessage(data?.updatedCount ?? 0, skipped);
         if (skipped.length > 0) { toast.warning(message); } else { toast.success(message); }
         invalidate();
      },
      onError: () => { toast.error('Error updating keyword locations.'); },
   });
}

export function useRefreshKeywords(onDone: () => void) {
   const invalidate = useKeywordsInvalidator();
   return useMutation({
      // Refreshing a whole domain has no ID list, so it keeps the query form; selected IDs go in the body.
      mutationFn: ({ ids = [], domain = '' }: { ids?: number[]; domain?: string }) => (
         ids.length === 0 && domain
            ? apiPost(`/api/serp/refresh?id=all&domain=${encodeURIComponent(domain)}`, {})
            : apiPost('/api/serp/refresh', { ids })
      ),
      onSuccess: () => { onDone(); toast.success('Keywords added to refresh queue'); invalidate(); },
      onError: (error) => { toast.error(error instanceof Error && error.message ? error.message : 'Error refreshing keywords.'); },
   });
}

/** Saves which optional columns the Tracker shows. The settings PUT merges, so only the column list is sent. */
export function useUpdateKeywordColumns() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (keywordsColumns: string[]) => apiPut('/api/app/settings', { settings: { keywordsColumns } }),
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: () => { toast.error('Error saving the column choice.'); },
   });
}

/** The heavier per-keyword data (full history and stored search results), loaded when the details sheet opens. */
export function useKeywordDetails(keywordID: number) {
   return useQuery({
      queryKey: ['keyword', keywordID] as const,
      queryFn: async () => {
         const result = await apiGet<{ keyword?: Record<string, unknown> }>(`/api/serp/keyword?id=${keywordID}`);
         return {
            history: (result.keyword?.history || {}) as KeywordHistory,
            searchResult: result.keyword?.lastResult,
            localResults: result.keyword?.localResults,
            mapPackTop3: normalizeToBoolean(result.keyword?.mapPackTop3),
         };
      },
   });
}
