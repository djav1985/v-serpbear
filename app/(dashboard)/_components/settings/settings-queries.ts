'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPut } from 'utils/client/apiClient';
import { settingsKey } from '../../domain/_components/keyword-queries';

/** The server's own message when it sent one (it says what to fix), otherwise the fallback. */
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message && !error.message.startsWith('Server error (') ? error.message : fallback);

export function useAppSettings(enabled: boolean, refetchWhenEnabled = false, includePrivate = false) {
   return useQuery({
      queryKey: includePrivate ? [...settingsKey, 'private'] : settingsKey,
      queryFn: async () => (await apiGet<{ settings: SettingsType }>(`/api/app/settings${includePrivate ? '?includePrivate=true' : ''}`)).settings,
      enabled,
      staleTime: refetchWhenEnabled ? 0 : undefined,
   });
}

export function useSaveSettings() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: (settings: Partial<SettingsType>) => apiPut('/api/app/settings', { settings }),
      onSuccess: () => { toast.success('Settings updated!'); queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: (error) => { toast.error(errorText(error, 'Error updating app settings.')); },
   });
}

export function useClearFailedQueue() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: () => apiPut('/api/serp/clearfailed', {}),
      onSuccess: () => { toast.success('Failed queue cleared'); queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: (error) => { toast.error(errorText(error, 'Error clearing failed queue.')); },
   });
}

// Upper bound on how long the retry status poll runs before giving up.
export const RETRY_POLL_MAX_DURATION_MS = 30 * 60 * 1000;
const RETRY_POLL_INTERVAL_MS = 1000;

export function useRetryFailedQueue() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async (keywordIDs: number[]) => {
         await apiPost('/api/serp/refresh', { ids: keywordIDs });
         const startedAt = Date.now();
         let pending = keywordIDs;
         while (pending.length > 0) {
            if (Date.now() - startedAt > RETRY_POLL_MAX_DURATION_MS) { throw new Error('Keyword retries are still running. Check the keywords later.'); }
            const status = await apiGet<{ keywords?: { ID: number; updating: boolean }[] }>(`/api/serp/refresh?status=retry&id=${pending.join(',')}`);
            pending = (status?.keywords ?? []).filter((keyword) => keyword.updating).map((keyword) => keyword.ID);
            if (pending.length > 0) { await new Promise<void>((resolve) => { setTimeout(resolve, RETRY_POLL_INTERVAL_MS); }); }
         }
      },
      onSuccess: () => { toast.success('Failed keyword retries completed'); queryClient.invalidateQueries({ queryKey: settingsKey }); },
      onError: (error) => { toast.error(errorText(error, 'Error retrying failed keywords.')); },
   });
}

export function useSendNotifications() {
   return useMutation({
      mutationFn: () => apiPost<{ message?: string; sent?: number; skipped?: number }>('/api/app/email', { type: 'digest' }),
      onSuccess: (response) => {
         const sent = response?.sent ?? 0;
         const skipped = response?.skipped ?? 0;
         if (sent > 0) {
            toast.success(`Sent ${sent} notification email${sent === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} skipped)` : ''}.`);
         } else {
            // Nothing went out, so this is not a plain success.
            toast.warning(response?.message || `No notifications were sent${skipped > 0 ? ` (${skipped} skipped)` : ''}.`);
         }
      },
      onError: (error) => { toast.error(errorText(error, 'Error sending notifications.')); },
   });
}

export function useRefreshSearchConsole() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: () => apiPost('/api/google/searchconsole', {}),
      onSuccess: () => {
         toast.success('Search Console data refreshed!');
         // Refreshed data should show up without a reload.
         queryClient.invalidateQueries({ queryKey: ['sc-keywords'] });
         queryClient.invalidateQueries({ queryKey: ['sc-insight'] });
      },
      onError: (error) => { toast.error(errorText(error, 'Error refreshing Search Console data')); },
   });
}

export function useTestAdwords() {
   return useMutation({
      mutationFn: (payload: { developer_token: string; account_id: string }) => apiPost('/api/adwords', payload),
      onSuccess: () => { toast.success('Google Ads has been integrated successfully!'); },
      onError: (error) => { toast.error(errorText(error, 'Failed to connect to Google Ads. Please make sure you have provided the correct API info.')); },
   });
}

export function useUpdateAllVolume() {
   return useMutation({
      mutationFn: () => apiPost<{ failedCountries?: string[] }>('/api/google/volume', { domain: 'all' }),
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
      onError: (error) => { toast.error(errorText(error, 'Error loading keyword volume data')); },
   });
}
