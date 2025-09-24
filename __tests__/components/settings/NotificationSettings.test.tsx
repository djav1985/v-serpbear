/// <reference path="../../../app/types.d.ts" />

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotificationSettings from '../../../app/components/settings/NotificationSettings';
import { useSendNotifications } from '../../../app/services/settings';

jest.mock('../../../app/services/settings');

const useSendNotificationsMock = useSendNotifications as jest.Mock;

const buildSettings = (overrides: Partial<SettingsType> = {}): SettingsType => ({
   scraper_type: 'none',
   notification_interval: 'daily',
   notification_email: 'notify@example.com',
   notification_email_from: 'no-reply@example.com',
   notification_email_from_name: 'SerpBear',
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
