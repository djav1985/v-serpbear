'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPut } from 'utils/client/apiClient';

type IdeasResponse = {
   data: { keywords: IdeaKeyword[]; favorites: IdeaKeyword[]; settings: DomainIdeasSettings };
};

/** The ideas of one domain, or of the Research page when no domain is given. */
export const ideasKey = (domain?: string | null) => ['keyword-ideas', domain || 'research'] as const;

// No domain on the Research page; the backend treats a missing domain as research.
export const fetchIdeas = (domain?: string | null) => (
   apiGet<IdeasResponse>(domain ? `/api/google/ideas?domain=${encodeURIComponent(domain)}` : '/api/google/ideas')
);

export const ideasQueryOptions = (domain?: string | null) => ({
   queryKey: ideasKey(domain),
   queryFn: () => fetchIdeas(domain),
   retry: false as const,
});

export function useIdeas(domain: string | null | undefined, enabled: boolean) {
   return useQuery({
      ...ideasQueryOptions(domain),
      enabled,
   });
}

/** Asks Google Ads for fresh ideas from the given seeds, country and language, and stores them. */
export function useLoadIdeas(domain?: string | null) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (payload: Record<string, unknown>) => apiPost('/api/google/ideas', { ...payload, ...(domain ? { domain } : {}) }),
      onSuccess: () => { toast.success('Keyword ideas loaded successfully!'); queryClient.invalidateQueries({ queryKey: ideasKey(domain) }); },
      onError: (error) => { toast.error(error instanceof Error && error.message ? error.message : 'Error loading keyword ideas'); },
   });
}

export function useFavoriteIdea(domain?: string | null) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: ({ keywordID }: { keywordID: string }) => apiPut('/api/google/ideas', { keywordID, domain: domain || undefined }),
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ideasKey(domain) }); },
      onError: () => { toast.error('Error favoriting keywords'); },
   });
}

type EmailIdeaPayload = {
   domain: string;
   keywords: {
      keyword: string;
      avgMonthlySearches?: number;
      monthlySearchVolumes?: Record<string, string | number> | null;
      competition?: string | null;
      competitionIndex?: number | string | null;
   }[];
};

export function useEmailIdeas(onDone: () => void) {
   return useMutation({
      mutationFn: (payload: EmailIdeaPayload) => apiPost<{ success?: boolean; error?: string | null }>('/api/app/email?type=ideas', payload),
      onSuccess: () => { toast.success('Keyword ideas emailed successfully!'); onDone(); },
      onError: (error) => { toast.error(error instanceof Error && error.message ? error.message : 'Error emailing keyword ideas.'); },
   });
}

export type SearchResultsResponse = {
   searchResult: { results: KeywordLastResult[]; keyword: string; position: number; country: string; device: string };
};

/** A live Google search for one idea, run only when the user asks for it. */
export const fetchSearchResults = (params: { keyword: string; country: string; device: string }) => (
   apiPost<SearchResultsResponse>('/api/serp/refresh', params)
);
