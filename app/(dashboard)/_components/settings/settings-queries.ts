'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPut } from 'utils/client/apiClient';
import { settingsKey } from '../../domain/_components/keyword-queries';

export function useAppSettings(enabled: boolean) {
   return useQuery({
      queryKey: settingsKey,
      queryFn: async () => (await apiGet<{ settings: SettingsType }>('/api/settings')).settings,
      enabled,
   });
}

export function useSaveSettings() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (settings: Partial<SettingsType>) => apiPut('/api/settings', { settings }),
      onSuccess: () => { toast.success('Settings updated!'); queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: () => { toast.error('Error updating app settings.'); },
   });
}

export function useClearFailedQueue() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: () => apiPut('/api/clearfailed', {}),
      onSuccess: () => { toast.success('Failed queue cleared'); queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: () => { toast.error('Error clearing failed queue.'); },
   });
}

// Upper bound on how long the retry status poll runs before giving up.
export const RETRY_POLL_MAX_DURATION_MS = 30 * 60 * 1000;
const RETRY_POLL_INTERVAL_MS = 1000;

export function useRetryFailedQueue() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async (keywordIDs: number[]) => {
         await apiPost(`/api/refresh?id=${keywordIDs.join(',')}`, {});
         const startedAt = Date.now();
         let pending = keywordIDs;
         while (pending.length > 0) {
            if (Date.now() - startedAt > RETRY_POLL_MAX_DURATION_MS) { throw new Error('Keyword retries are still running. Check the keywords later.'); }
            const status = await apiGet<{ keywords?: { ID: number; updating: boolean }[] }>(`/api/refresh?status=retry&id=${pending.join(',')}`);
            pending = (status?.keywords ?? []).filter((keyword) => keyword.updating).map((keyword) => keyword.ID);
            if (pending.length > 0) { await new Promise<void>((resolve) => { setTimeout(resolve, RETRY_POLL_INTERVAL_MS); }); }
         }
      },
      onSuccess: () => { toast.success('Failed keyword retries completed'); queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: (error) => { toast.error(error instanceof Error && error.message ? error.message : 'Error retrying failed keywords.'); },
   });
}

export function useSendNotifications() {
   return useMutation({
      mutationFn: () => apiPost<{ message?: string }>('/api/notify', {}),
      onSuccess: (response) => { toast.success(response?.message || 'Notifications sent!'); },
      onError: (error) => { toast.error(error instanceof Error && error.message ? error.message : 'Error sending notifications.'); },
   });
}

export function useRefreshSearchConsole() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: () => apiPost('/api/searchconsole', {}),
      onSuccess: () => {
         toast.success('Search Console data refreshed!');
         // Refreshed data should show up without a reload.
         queryClient.invalidateQueries({ queryKey: ['sc-keywords'] });
         queryClient.invalidateQueries({ queryKey: ['sc-insight'] });
      },
      onError: () => { toast.error('Error refreshing Search Console data'); },
   });
}

export function useTestAdwords() {
   return useMutation({
      mutationFn: (payload: { developer_token: string; account_id: string }) => apiPost('/api/adwords', payload),
      onSuccess: () => { toast.success('Google Ads has been integrated successfully!'); },
      onError: () => { toast.error('Failed to connect to Google Ads. Please make sure you have provided the correct API info.'); },
   });
}

export function useUpdateAllVolume() {
   return useMutation({
      mutationFn: () => apiPost<{ failedCountries?: string[] }>('/api/volume', { domain: 'all' }),
      onSuccess: (response) => {
         const failed = response?.failedCountries ?? [];
         if (failed.length > 0) {
            // Some countries loaded and some did not, so this is not a plain success.
            toast.warning(`Keyword volume updated, but Google Ads could not be reached for: ${failed.join(', ')}. Reloading page...`);
         } else {
            toast.success('Keyword volume data loaded successfully! Reloading page...');
         }
         setTimeout(() => { window.location.reload(); }, 3000);
      },
      onError: (error) => { toast.error(error instanceof Error && error.message ? error.message : 'Error loading keyword volume data'); },
   });
}
