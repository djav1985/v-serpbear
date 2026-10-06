import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { apiGet, apiPost, apiPut } from '../utils/client/apiClient';

export async function fetchSettings() {
   return apiGet<{ settings: SettingsType }>('/api/settings');
}

export function useFetchSettings() {
   return useQuery('settings', () => fetchSettings());
}

export const useUpdateSettings = (onSuccess: (() => void) | undefined) => {
   const queryClient = useQueryClient();

   return useMutation(async (settings: SettingsType) => (
      apiPut('/api/settings', { settings })
   ), {
      onSuccess: async () => {
         if (onSuccess) {
            onSuccess();
         }
         toast('Settings Updated!', { icon: '✔️' });
         queryClient.invalidateQueries(['settings']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Updating App Settings.', { icon: '⚠️' });
      },
   });
};

export function useClearFailedQueue(onSuccess: () => void) {
   const queryClient = useQueryClient();
   return useMutation(async () => (
      apiPut('/api/clearfailed', {})
   ), {
      onSuccess: async () => {
         onSuccess();
         toast('Failed Queue Cleared', { icon: '✔️' });
         queryClient.invalidateQueries(['settings']);
      },
      onError: (_error, _variables, _context) => {
         toast('Error Clearing Failed Queue.', { icon: '⚠️' });
      },
   });
}

export function useRetryFailedQueue() {
   const queryClient = useQueryClient();
   return useMutation(async (keywordIDs: number[]) => {
      const ids = keywordIDs.join(',');
      await apiPost(`/api/refresh?id=${ids}`, {});

      let pendingKeywordIDs = keywordIDs;
      while (pendingKeywordIDs.length > 0) {
         const status = await apiGet<{ keywords: Array<{ ID: number; updating: boolean }> }>(
            `/api/refresh?status=retry&id=${pendingKeywordIDs.join(',')}`,
         );
         pendingKeywordIDs = status.keywords.filter((keyword) => keyword.updating).map((keyword) => keyword.ID);
         if (pendingKeywordIDs.length > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 1000));
         }
      }
   }, {
      onSuccess: async () => {
         toast('Failed keyword retries completed', { icon: '✔️' });
         queryClient.invalidateQueries(['settings']);
      },
      onError: (error) => {
         toast((error as Error)?.message || 'Error Retrying Failed Keywords.', { icon: '⚠️' });
      },
   });
}

export const useSendNotifications = () => useMutation(async () => (
      apiPost<{ message?: string }>('/api/notify', {})
   ), {
      onSuccess: (response) => {
         const successMessage = response?.message || 'Notifications Sent!';
         toast(successMessage, { icon: '✔️' });
      },
      onError: (error, _variables, _context) => {
         toast((error as Error)?.message || 'Error Sending Notifications.', { icon: '⚠️' });
      },
   });

// Migration helpers were removed when the database API endpoint was retired. The
// Docker entrypoint now owns running migrations during container startup.
