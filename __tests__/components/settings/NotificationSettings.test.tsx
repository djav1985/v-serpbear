/// <reference path="../../../types.d.ts" />

/**
 * Tests for the settings panels: NotificationSettings manual trigger, the
 * Settings scraper reload behaviour, and the SearchConsoleSettings refresh button.
 */

jest.mock('../../../services/settings');
jest.mock('../../../hooks/useBranding');
jest.mock('../../../services/searchConsole', () => ({
   refreshSearchConsoleData: jest.fn(),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import NotificationSettings from '../../../components/settings/NotificationSettings';
import { useSendNotifications } from '../../../services/settings';
import { useBranding } from '../../../hooks/useBranding';
import { DEFAULT_BRANDING, BrandingConfig } from '../../../utils/branding';
import { dummySettings } from '../../../__mocks__/data';

const useSendNotificationsMock = useSendNotifications as jest.Mock;
const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

const buildBrandingState = (branding: BrandingConfig = DEFAULT_BRANDING) => ({
   branding,
   isLoading: false,
   isError: false,
   isFetching: false,
   refetch: jest.fn(),
});

const buildSettings = (overrides: Partial<SettingsType> = {}): SettingsType => ({
   scraper_type: 'none',
   notification_interval: 'daily',
   notification_email: 'notify@example.com',
   notification_email_from: 'no-reply@example.com',
   notification_email_from_name: DEFAULT_BRANDING.platformName,
   smtp_server: 'smtp.example.com',
   smtp_port: '587',
   smtp_tls_servername: '',
   smtp_username: 'smtp-user',
   smtp_password: 'smtp-pass',
   search_console: true,
   search_console_client_email: '',
   search_console_private_key: '',
   keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
   ...overrides,
});

describe('NotificationSettings manual trigger', () => {
   beforeEach(() => {
      mockUseBranding.mockReturnValue(buildBrandingState(DEFAULT_BRANDING));
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('renders the manual trigger with correct initial state and accessibility attributes', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: false });

      render(
         <NotificationSettings
            settings={buildSettings()}
            settingsError={null}
            updateSettings={jest.fn()}
         />,
      );

      const triggerButton = screen.getByRole('button', { name: /send notifications now/i });
      expect(triggerButton).toBeEnabled();
      expect(triggerButton).toHaveAttribute('aria-busy', 'false');
      expect(screen.getByText(/Send a notification email immediately/i)).toBeInTheDocument();
      expect(screen.getByText(/Ready to send notifications immediately\./i)).toBeInTheDocument();
   });

   it('prefills the From Name field with the runtime branding name when empty', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: false });
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         platformName: 'Acme Ranker',
         whiteLabelEnabled: true,
      };
      mockUseBranding.mockReturnValue(buildBrandingState(customBranding));

      render(
         <NotificationSettings
            settings={buildSettings({ notification_email_from_name: '' })}
            settingsError={null}
            updateSettings={jest.fn()}
         />,
      );

      expect(screen.getByDisplayValue('Acme Ranker')).toBeInTheDocument();
   });

   it('calls the send notifications mutation when the button is clicked', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: false });

      render(
         <NotificationSettings
            settings={buildSettings()}
            settingsError={null}
            updateSettings={jest.fn()}
         />,
      );

      const triggerButton = screen.getByRole('button', { name: /send notifications now/i });
      fireEvent.click(triggerButton);

      expect(mutate).toHaveBeenCalledTimes(1);
   });

   it('disables the button while notifications are being sent', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: true });

      render(
         <NotificationSettings
            settings={buildSettings()}
            settingsError={null}
            updateSettings={jest.fn()}
         />,
      );

      const triggerButton = screen.getByRole('button', { name: /send notifications now/i });

      expect(triggerButton).toBeDisabled();
   });

   it('announces progress updates for assistive technology when sending notifications', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: true });

      render(
         <NotificationSettings
            settings={buildSettings()}
            settingsError={null}
            updateSettings={jest.fn()}
         />,
      );

      const triggerButton = screen.getByRole('button', { name: /send notifications now/i });

      expect(triggerButton).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText(/Sending notifications/i)).toBeInTheDocument();
   });

   it('handles numeric SMTP values without throwing TypeError', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: false });

      // Test case: SMTP values as numbers (from JSON parsing)
      const settingsWithNumericValues = buildSettings({
         smtp_port: 587 as any, // Simulating number from JSON
         smtp_server: 'smtp.example.com', // String is fine
      });

      // This should not throw a TypeError: ...trim is not a function
      expect(() => {
         render(
            <NotificationSettings
               settings={settingsWithNumericValues}
               settingsError={null}
               updateSettings={jest.fn()}
            />,
         );
      }).not.toThrow();

      // Verify the component still renders correctly
      expect(screen.getByRole('button', { name: /send notifications now/i })).toBeInTheDocument();
   });

   it('handles mixed string and numeric SMTP values correctly', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: false });

      // Test realistic scenario where some values are strings and others are numbers
      const mixedSettings = buildSettings({
         smtp_server: 'smtp.gmail.com',
         smtp_port: 587 as any, // Number from JSON
         smtp_username: '  user@example.com  ', // String with whitespace
         smtp_password: 'password123',
      });

      expect(() => {
         render(
            <NotificationSettings
               settings={mixedSettings}
               settingsError={null}
               updateSettings={jest.fn()}
            />,
         );
      }).not.toThrow();

      // Verify component renders and button is enabled (if all required fields are present)
      const button = screen.getByRole('button', { name: /send notifications now/i });
      expect(button).toBeInTheDocument();

      // Since we have all required fields, button should be enabled
      expect(button).toBeEnabled();
   });

   it('handles null and undefined SMTP values gracefully', () => {
      const mutate = jest.fn();
      useSendNotificationsMock.mockReturnValue({ mutate, isLoading: false });

      const settingsWithNullValues = buildSettings({
         smtp_port: null as any,
         smtp_server: undefined as any,
      });

      expect(() => {
         render(
            <NotificationSettings
               settings={settingsWithNullValues}
               settingsError={null}
               updateSettings={jest.fn()}
            />,
         );
      }).not.toThrow();
   });
});

describe('Settings scraper reload behaviour', () => {
  const { useFetchSettings, useUpdateSettings, useClearFailedQueue, useRetryFailedQueue } = require('../../../services/settings');
  const { defaultSettings } = require('../../../components/settings/Settings');

  const closeSettings = jest.fn();
  let queryClient: QueryClient;

  const renderComponent = () => {
    const Settings = require('../../../components/settings/Settings').default;
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
      available_scapers: [{ label: 'SerpApi', value: 'serpapi' }],
      scraper_type: 'none',
    };

    useFetchSettings.mockReturnValue({ data: { settings: settingsData }, isLoading: false });
    useClearFailedQueue.mockReturnValue({ mutate: jest.fn(), isLoading: false });
    useRetryFailedQueue.mockReturnValue({ mutate: jest.fn(), isLoading: false });
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

      const scraperOption = await screen.findByText('SerpApi');
      fireEvent.click(scraperOption);

      const apiKeyInput = await screen.findByPlaceholderText('API Key/Token');
      fireEvent.change(apiKeyInput, { target: { value: 'serpapi-key' } });

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
      expect(payload.scraper_type).toBe('serpapi');
    } finally {
      reloadSpy.mockRestore();
    }
  });

  it('retries all failed keywords from the settings panel', async () => {
    const retryMutate = jest.fn();
    useRetryFailedQueue.mockReturnValue({ mutate: retryMutate, isLoading: false });
    useUpdateSettings.mockReturnValue({ mutateAsync: jest.fn(), isLoading: false });
    useFetchSettings.mockReturnValue({
      data: {
        settings: {
          ...defaultSettings,
          notification_interval: 'never',
          scrape_retry: true,
          failed_queue: [12, 34],
        },
      },
      isLoading: false,
    });

    renderComponent();

    const retryButton = await screen.findByRole('button', { name: /retry all failed now/i });
    fireEvent.click(retryButton);

    expect(retryMutate).toHaveBeenCalledWith([12, 34]);
  });
});

describe('SearchConsoleSettings Component', () => {
  const { refreshSearchConsoleData } = require('../../../services/searchConsole');

  it('renders refresh button and calls refreshSearchConsoleData', async () => {
    const SearchConsoleSettings = require('../../../components/settings/SearchConsoleSettings').default;

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
