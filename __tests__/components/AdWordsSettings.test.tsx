import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import Settings from '../../components/settings/Settings';

const toastMock = jest.fn();
const mockUpdateSettingsAsync = jest.fn();
const mockFetchSettings = jest.fn();
const mockRefetchSettings = jest.fn();
const mockAdsMutate = jest.fn();

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
}));

jest.mock('react-hot-toast', () => ({
   __esModule: true,
   default: (...args: unknown[]) => toastMock(...args),
}));

jest.mock('../../services/adwords', () => ({
   useTestAdwordsIntegration: jest.fn(() => ({ mutate: mockAdsMutate, isLoading: false })),
   useMutateKeywordsVolume: jest.fn(() => ({ mutate: mockAdsMutate, isLoading: false })),
}));

jest.mock('../../services/settings', () => ({
   useFetchSettings: () => mockFetchSettings(),
   useUpdateSettings: () => ({ mutateAsync: (...args: unknown[]) => mockUpdateSettingsAsync(...args), isLoading: false }),
   useSendNotifications: () => ({ mutate: jest.fn(), isLoading: false }),
   useClearFailedQueue: () => ({ mutate: jest.fn(), isLoading: false }),
   useRetryFailedQueue: () => ({ mutate: jest.fn(), isLoading: false }),
}));

jest.mock('../../hooks/useBranding', () => ({
   useBranding: () => ({ branding: { platformName: 'SERPBear' } }),
}));

// Mock window.history.replaceState
const mockReplaceState = jest.fn();
Object.defineProperty(window, 'history', {
   value: { replaceState: mockReplaceState },
   writable: true,
});

describe('Google Ads OAuth result handling in Settings', () => {
   // Notifications are off and the scraper is 'none', so performUpdate can save without validation errors.
   const baseSettings = {
      adwords_client_id: 'client',
      adwords_client_secret: 'secret',
      adwords_developer_token: 'dev',
      adwords_account_id: '123-456-7890',
      adwords_refresh_token: 'token',
      scraper_type: 'none',
      notification_interval: 'never',
      keywordsColumns: [],
   } as any;

   const noop = () => undefined;

   const queryClient = new QueryClient();
   const settingsElement = (
      <QueryClientProvider client={queryClient}>
         <Settings closeSettings={noop} />
      </QueryClientProvider>
   );
   const renderSettings = () => render(settingsElement);

   beforeEach(() => {
      jest.clearAllMocks();
      mockUpdateSettingsAsync.mockResolvedValue(undefined);
      mockFetchSettings.mockReturnValue({ data: { settings: baseSettings }, isLoading: false, refetch: mockRefetchSettings });
      mockRefetchSettings.mockResolvedValue({ data: { settings: baseSettings } });
      mockReplaceState.mockClear();
      // Reset URL search params
      Object.defineProperty(window, 'location', {
         value: {
            ...window.location,
            search: '',
            href: 'http://localhost:3000',
         },
         writable: true,
      });
   });

   it('handles successful integration messages', async () => {
      renderSettings();

      await act(async () => {
         window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { type: 'adwordsIntegrated', status: 'success' },
         }));
      });

      await waitFor(() => {
         expect(mockRefetchSettings).toHaveBeenCalled();
      });
      expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
   });

   it('keeps handling the integration result after switching settings tabs', async () => {
      renderSettings();

      fireEvent.click(screen.getByText('Integrations'));
      fireEvent.click(screen.getByText('Google Ads'));

      await act(async () => {
         window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { type: 'adwordsIntegrated', status: 'success' },
         }));
      });

      await waitFor(() => {
         expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
      });
   });

   it('shows the upstream error message when integration fails', async () => {
      renderSettings();

      const detail = 'Custom integration error';
      await act(async () => {
         window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { type: 'adwordsIntegrated', status: 'error', message: detail },
         }));
      });

      expect(toastMock).toHaveBeenCalledWith(detail, { icon: '⚠️' });
   });

   it('does not start Google authentication when saving the credentials fails', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ authUrl: 'https://accounts.google.com/x' }) } as unknown as Response);
      mockUpdateSettingsAsync.mockRejectedValue(new Error('save failed'));
      renderSettings();

      fireEvent.click(screen.getByText('Integrations'));
      fireEvent.click(screen.getByText('Google Ads'));
      await act(async () => {
         fireEvent.click(screen.getByText(/Authenticate Integration/));
      });

      expect(mockUpdateSettingsAsync).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalledWith('/api/adwords', expect.anything());
      fetchSpy.mockRestore();
   });

   it('keeps unsaved edits when the settings are refetched', () => {
      mockFetchSettings.mockReturnValue({
         data: { settings: { ...baseSettings, notification_interval: 'daily', smtp_server: '' } },
         isLoading: false,
         refetch: mockRefetchSettings,
      });
      const { rerender } = renderSettings();

      fireEvent.click(screen.getByText('Notification'));
      const smtpInput = screen.getByPlaceholderText('smtp.example.com') as HTMLInputElement;
      fireEvent.change(smtpInput, { target: { value: 'unsaved.example.com' } });

      mockFetchSettings.mockReturnValue({
         data: { settings: { ...baseSettings, notification_interval: 'daily', smtp_server: 'server.example.com' } },
         isLoading: false,
         refetch: mockRefetchSettings,
      });
      rerender(settingsElement);

      expect((screen.getByPlaceholderText('smtp.example.com') as HTMLInputElement).value).toBe('unsaved.example.com');
   });
});
