import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { apiGet, apiPost, apiPut } from '../utils/client/apiClient';

export async function fetchSettings() {
   return apiGet('/api/settings');
}

export function useFetchSettings() {
   return useQuery('settings', () => fetchSettings());
}

export const useUpdateSettings = (onSuccess:Function|undefined) => {
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

export function useClearFailedQueue(onSuccess:Function) {
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
