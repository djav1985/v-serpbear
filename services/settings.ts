import toast from 'react-hot-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientOrigin } from '../utils/client/origin';

export async function fetchSettings() {
   const origin = getClientOrigin();
   const res = await fetch(`${origin}/api/settings`, { method: 'GET' });
   return res.json();
}

export function useFetchSettings() {
   return useQuery({ queryKey: ['settings'], queryFn: () => fetchSettings() });
}

export const useUpdateSettings = (onSuccess:Function|undefined) => {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (settings: SettingsType) => {
      // console.log('settings: ', JSON.stringify(settings));

      const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
      const fetchOpts = { method: 'PUT', headers, body: JSON.stringify({ settings }) };
      const origin = getClientOrigin();
      const res = await fetch(`${origin}/api/settings`, fetchOpts);
      if (res.status >= 400 && res.status < 600) {
         throw new Error('Bad response from server');
      }
      return res.json();
      },
      onSuccess: async () => {
         if (onSuccess) {
            onSuccess();
         }
         toast('Settings Updated!', { icon: '✔️' });
         queryClient.invalidateQueries({ queryKey: ['settings'] });
      },
      onError: (_error, _variables, _context) => {
         console.log('Error Updating App Settings!!!');
         toast('Error Updating App Settings.', { icon: '⚠️' });
      },
   });
};

export function useClearFailedQueue(onSuccess:Function) {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async () => {
         const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
         const fetchOpts = { method: 'PUT', headers };
         const origin = getClientOrigin();
         const res = await fetch(`${origin}/api/clearfailed`, fetchOpts);
         if (res.status >= 400 && res.status < 600) {
            throw new Error('Bad response from server');
         }
         return res.json();
      },
      onSuccess: async () => {
         onSuccess();
         toast('Failed Queue Cleared', { icon: '✔️' });
         queryClient.invalidateQueries({ queryKey: ['settings'] });
      },
      onError: (_error, _variables, _context) => {
         console.log('Error Clearing Failed Queue!!!');
         toast('Error Clearing Failed Queue.', { icon: '⚠️' });
      },
   });
}

export const useSendNotifications = () => useMutation({
      mutationFn: async () => {
         const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
         const fetchOpts = { method: 'POST', headers };
         const origin = getClientOrigin();
         const res = await fetch(`${origin}/api/notify`, fetchOpts);
         let data: unknown = null;

         try {
            data = await res.json();
         } catch (error) {
            console.warn('Failed to parse notification response JSON', error);
            data = null;
         }

         if (!res.ok) {
            const errorData = data as { message?: string; error?: string };
            const errorMessage = errorData?.message || errorData?.error || 'Error Sending Notifications.';
            throw new Error(errorMessage);
         }

         return data;
      },
      onSuccess: (response) => {
         const successData = response as { message?: string };
         const successMessage = successData?.message || 'Notifications Sent!';
         toast(successMessage, { icon: '✔️' });
      },
      onError: (error, _variables, _context) => {
         toast((error as Error)?.message || 'Error Sending Notifications.', { icon: '⚠️' });
      },
   });

// Migration helpers were removed when the database API endpoint was retired. The
// Docker entrypoint now owns running migrations during container startup.
