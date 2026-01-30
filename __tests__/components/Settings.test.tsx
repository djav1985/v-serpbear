/// <reference path="../../types.d.ts" />

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import Settings, { defaultSettings } from '../../components/settings/Settings';
import { useClearFailedQueue, useFetchSettings, useUpdateSettings } from '../../services/settings';
import { useBranding } from '../../hooks/useBranding';
import { DEFAULT_BRANDING } from '../../utils/branding';

jest.mock('../../services/settings');
jest.mock('../../hooks/useBranding');

const useFetchSettingsMock = useFetchSettings as jest.Mock;
const useUpdateSettingsMock = useUpdateSettings as jest.Mock;
const useClearFailedQueueMock = useClearFailedQueue as jest.Mock;
const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

describe('Settings scraper reload behaviour', () => {
   const closeSettings = jest.fn();
   let queryClient: QueryClient;
   const renderComponent = () => render(
         <QueryClientProvider client={queryClient}>
            <Settings closeSettings={closeSettings} />
         </QueryClientProvider>,
      );

   beforeEach(() => {
      queryClient = new QueryClient();
      mockUseBranding.mockReturnValue({
         branding: DEFAULT_BRANDING,
         isLoading: false,
         isError: false,
         isFetching: false,
         refetch: jest.fn(),
      });
      const settingsData: SettingsType = {
         ...defaultSettings,
         notification_interval: 'never',
         available_scapers: [{ label: 'Proxy', value: 'proxy' }],
         scraper_type: 'none',
      };

      useFetchSettingsMock.mockReturnValue({ data: { settings: settingsData }, isLoading: false });
      useClearFailedQueueMock.mockReturnValue({ mutate: jest.fn(), isLoading: false });
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('reloads the page when enabling a scraper from the disabled state', async () => {
      const mutateAsync = jest.fn().mockResolvedValue({});
      useUpdateSettingsMock.mockReturnValue({ mutateAsync, isLoading: false });

      const reloadSpy = jest.spyOn(window.location, 'reload').mockImplementation(() => undefined);

      try {
         const { container } = renderComponent();
         const scraperSelect = container.querySelector('.settings__section__select .selected') as HTMLElement | null;
         if (!scraperSelect) {
            throw new Error('Could not locate scraper selector');
         }
         fireEvent.click(scraperSelect);

         const proxyOption = await screen.findByText('Proxy');
         fireEvent.click(proxyOption);

         const updateButton = container.querySelector('button.bg-blue-700') as HTMLElement | null;
         if (!updateButton) {
            throw new Error('Could not locate update button');
         }
         fireEvent.click(updateButton);

         await waitFor(() => {
            expect(mutateAsync).toHaveBeenCalled();
            expect(reloadSpy).toHaveBeenCalled();
         });

         const payload = mutateAsync.mock.calls[0][0] as SettingsType;
         expect(payload.scraper_type).toBe('proxy');
      } finally {
         reloadSpy.mockRestore();
      }
   });
});
