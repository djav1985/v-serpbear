/// <reference path="../../types.d.ts" />

/**
 * Behavior tests for settings-related panels: Settings (scraper reload) and
 * SearchConsoleSettings (refresh button).
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dummySettings } from '../../__mocks__/data';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

jest.mock('../../hooks/useBranding');

const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

const buildBrandingState = () => ({
  branding: DEFAULT_BRANDING,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

// ---------------------------------------------------------------------------
// Settings – scraper reload behaviour
// ---------------------------------------------------------------------------

jest.mock('../../services/settings');

describe('Settings scraper reload behaviour', () => {
  const { useFetchSettings, useUpdateSettings, useClearFailedQueue } = require('../../services/settings');
  const { defaultSettings } = require('../../components/settings/Settings');

  const closeSettings = jest.fn();
  let queryClient: QueryClient;

  const renderComponent = () => {
    const Settings = require('../../components/settings/Settings').default;
    return render(
      <QueryClientProvider client={queryClient}>
        <Settings closeSettings={closeSettings} />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient();
    mockUseBranding.mockReturnValue(buildBrandingState());

    const settingsData: SettingsType = {
      ...defaultSettings,
      notification_interval: 'never',
      available_scapers: [{ label: 'Proxy', value: 'proxy' }],
      scraper_type: 'none',
    };

    useFetchSettings.mockReturnValue({ data: { settings: settingsData }, isLoading: false });
    useClearFailedQueue.mockReturnValue({ mutate: jest.fn(), isLoading: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reloads the page when enabling a scraper from the disabled state', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({});
    useUpdateSettings.mockReturnValue({ mutateAsync, isLoading: false });

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

// ---------------------------------------------------------------------------
// SearchConsoleSettings – refresh button
// ---------------------------------------------------------------------------

jest.mock('../../services/searchConsole', () => ({
  refreshSearchConsoleData: jest.fn(),
}));

describe('SearchConsoleSettings Component', () => {
  const { refreshSearchConsoleData } = require('../../services/searchConsole');

  it('renders refresh button and calls refreshSearchConsoleData', async () => {
    const SearchConsoleSettings = require('../../components/settings/SearchConsoleSettings').default;

    const settings = {
      ...dummySettings,
      search_console_client_email: '',
      search_console_private_key: '',
    } as any;
    const updateSettings = jest.fn();

    render(
      <SearchConsoleSettings
        settings={settings}
        settingsError={null}
        updateSettings={updateSettings}
      />,
    );

    const button = screen.getByRole('button', { name: /refresh search console data/i });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(refreshSearchConsoleData).toHaveBeenCalled());
  });
});
