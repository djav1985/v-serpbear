import toast from 'react-hot-toast';
import { useMutation } from 'react-query';
import { apiPost } from '../utils/client/apiClient';

type EmailIdeaKeywordPayload = {
   keyword: string;
   avgMonthlySearches?: number;
   monthlySearchVolumes?: Record<string, string | number> | null;
   competition?: string | null;
   competitionIndex?: number | string | null;
};

type EmailKeywordIdeasPayload = {
   domain: string;
   keywords: EmailIdeaKeywordPayload[];
};

type EmailKeywordIdeasResponse = {
   success?: boolean;
   error?: string | null;
};

export function useEmailKeywordIdeas(onSuccess?: () => void) {
   return useMutation(async (payload: EmailKeywordIdeasPayload) => (
      apiPost<EmailKeywordIdeasResponse>('/api/ideas/email', payload)
   ), {
      onSuccess: () => {
         toast('Keyword ideas emailed successfully!', { icon: '✔️' });
         if (onSuccess) {
            onSuccess();
         }
      },
      onError: (error: unknown) => {
         const message = error instanceof Error ? error.message : 'Error emailing keyword ideas.';
         toast(message || 'Error emailing keyword ideas.', { icon: '⚠️' });
      },
   });
}

export type { EmailKeywordIdeasPayload, EmailIdeaKeywordPayload };
