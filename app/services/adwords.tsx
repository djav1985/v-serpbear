import { NextRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';

const parseJsonResponse = async (res: Response) => {
   const text = await res.text();
   if (!text) { return {}; }
   try {
      return JSON.parse(text);
   } catch (error) {
      const snippet = text.substring(0, 200) || `status ${res.status}`;
      throw new Error(res.ok ? `Unexpected response (${res.status}): ${snippet}` : snippet);
   }
};

export function useTestAdwordsIntegration(onSuccess?: Function) {
   return useMutation(async (payload:{developer_token:string, account_id:string}) => {
      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'POST', headers, body: JSON.stringify({ ...payload }) };
      const res = await fetch(`${window.location.origin}/api/adwords`, fetchOpts);
      const responsePayload = await parseJsonResponse(res);
      if (!res.ok) {
         const errorMessage = typeof responsePayload === 'string'
            ? responsePayload
            : responsePayload?.error || responsePayload?.message || `Server error (${res.status}): Please try again later`;
         throw new Error(errorMessage);
      }
      return responsePayload;
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
   const res = await fetch(`${window.location.origin}/api/ideas?domain=${domainSlug}`, { method: 'GET' });
   if (res.status >= 400 && res.status < 600) {
      if (res.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }
      let errorMessage = 'Bad response from server';
      try {
         const contentType = res.headers.get('content-type');
         if (contentType && contentType.includes('application/json')) {
            const errorData = await res.json();
            errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
         } else {
            // Handle HTML error pages or other non-JSON responses
            const textResponse = await res.text();
            console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
      } catch (parseError) {
         console.warn('Failed to parse error response:', parseError);
         errorMessage = `Server error (${res.status}): Please try again later`;
      }
      throw new Error(errorMessage);
   }
   return res.json();
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
      const res = await fetch(`${window.location.origin}/api/ideas`, fetchOpts);
      const isOk = typeof res.ok === 'boolean' ? res.ok : (res.status >= 200 && res.status < 300);

      let responsePayload: any = null;
      try {
         responsePayload = await parseJsonResponse(res);
      } catch (error) {
         if (res.status === 401) {
            console.log('Unauthorized!!');
            router.push('/login');
         }
         if (!isOk) {
            throw new Error(`Server error (${res.status}): Please try again later`);
         }
         throw error instanceof Error ? error : new Error('Error Loading Keyword Ideas');
      }

      if (res.status === 401) {
         console.log('Unauthorized!!');
         router.push('/login');
      }

      if (!isOk) {
         const errorMessage = typeof responsePayload === 'string'
            ? responsePayload
            : responsePayload?.error || responsePayload?.message || `Server error (${res.status}): Please try again later`;
         throw new Error(errorMessage);
      }

      if (responsePayload?.error) {
         throw new Error(responsePayload.error);
      }

      return responsePayload;
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
      const res = await fetch(`${window.location.origin}/api/ideas`, fetchOpts);
      if (res.status >= 400 && res.status < 600) {
         let errorMessage = 'Bad response from server';
         try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
               const errorData = await res.json();
               errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
            } else {
               // Handle HTML error pages or other non-JSON responses
               const textResponse = await res.text();
               console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
               errorMessage = `Server error (${res.status}): Please try again later`;
            }
         } catch (parseError) {
            console.warn('Failed to parse error response:', parseError);
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
         throw new Error(errorMessage);
      }
      return res.json();
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
      const res = await fetch(`${window.location.origin}/api/volume`, fetchOpts);
      if (res.status >= 400 && res.status < 600) {
         let errorMessage = 'Bad response from server';
         try {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
               const errorData = await res.json();
               errorMessage = errorData?.error ? errorData.error : 'Bad response from server';
            } else {
               // Handle HTML error pages or other non-JSON responses
               const textResponse = await res.text();
               console.warn('Non-JSON error response received:', textResponse.substring(0, 200));
               errorMessage = `Server error (${res.status}): Please try again later`;
            }
         } catch (parseError) {
            console.warn('Failed to parse error response:', parseError);
            errorMessage = `Server error (${res.status}): Please try again later`;
         }
         throw new Error(errorMessage);
      }
      return res.json();
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
         const message = (error as Error)?.message || 'Error Loading Keyword Volume Data';
         toast(message, { icon: '⚠️' });
      },
   });
}
