import toast from 'react-hot-toast';
import { useMutation } from 'react-query';
import { getClientOrigin } from '../utils/client/origin';
import { throwOnError } from '../utils/client/fetchWithError';

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
   return useMutation(async (payload: EmailKeywordIdeasPayload) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const origin = getClientOrigin();
      const response = await fetch(`${origin}/api/ideas/email`, {
         method: 'POST',
         headers,
         body: JSON.stringify(payload),
      });
      await throwOnError(response);
      return response.json() as Promise<EmailKeywordIdeasResponse>;
   }, {
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
