import toast from 'react-hot-toast';
import { useMutation } from 'react-query';
import { getClientOrigin } from '../utils/client/origin';

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

const parseErrorMessage = async (res: Response): Promise<string> => {
   try {
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
         const data = await res.json() as EmailKeywordIdeasResponse;
         if (data?.error) {
            return data.error;
         }
      } else {
         const text = await res.text();
         if (text) {
            return text.slice(0, 200);
         }
      }
   } catch (_error) {
      // Silently handle parse errors
   }
   return `Server error (${res.status}): Please try again later.`;
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
      if (response.status >= 400) {
         const errorMessage = await parseErrorMessage(response);
         throw new Error(errorMessage);
      }
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
