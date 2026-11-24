import { act, renderHook, waitFor } from '@testing-library/react';
import { createQueryClientWrapper } from '../__helpers__';
import { useRefreshSearchConsole, useSaveSettings, useSendNotifications } from 'app/(dashboard)/_components/settings/settings-queries';
import * as apiClient from 'utils/client/apiClient';
import { toast } from 'sonner';

jest.mock('utils/client/apiClient', () => ({
   ...jest.requireActual('utils/client/apiClient'),
   callApi: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const callApi = apiClient.callApi as jest.Mock;
const mockedToast = toast as jest.Mocked<typeof toast>;

describe('Settings mutations', () => {
   beforeEach(() => { jest.clearAllMocks(); });

   it('saves app settings, reports success, and invalidates cached settings', async () => {
      callApi.mockResolvedValue({});
      const { client, wrapper } = createQueryClientWrapper();
      const invalidate = jest.spyOn(client, 'invalidateQueries');
      const { result } = renderHook(() => useSaveSettings(), { wrapper });
      const settings = { scraper_type: 'scrapingant' } as Partial<SettingsType>;

      await act(async () => result.current.mutateAsync(settings));

      expect(callApi).toHaveBeenCalledWith('settings.save', { body: { settings } });
      expect(mockedToast.success).toHaveBeenCalledWith('Settings updated!');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] });
      client.clear();
   });

   it('reports sent and skipped notification counts, and explains when none were sent', async () => {
      callApi.mockResolvedValueOnce({ sent: 1, skipped: 2 }).mockResolvedValueOnce({ sent: 0, skipped: 1, message: 'No recipients configured' });
      const { wrapper } = createQueryClientWrapper();
      const { result } = renderHook(() => useSendNotifications(), { wrapper });

      await act(async () => result.current.mutateAsync());
      await act(async () => result.current.mutateAsync());

      expect(mockedToast.success).toHaveBeenCalledWith('Sent 1 notification email (2 skipped).');
      expect(mockedToast.warning).toHaveBeenCalledWith('No recipients configured');
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(callApi).toHaveBeenCalledWith('email.digest', { body: { type: 'digest' } });
   });

   it('refreshes Search Console data and invalidates both dependent views', async () => {
      callApi.mockResolvedValue({});
      const { client, wrapper } = createQueryClientWrapper();
      const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useRefreshSearchConsole(), { wrapper });

      await act(async () => result.current.mutateAsync());
      await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
      expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: ['sc-keywords'] });
      expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ['sc-insight'] });
      expect(mockedToast.success).toHaveBeenCalledWith('Search Console data refreshed!');
      client.clear();
   });
});
