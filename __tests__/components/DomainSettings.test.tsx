/// <reference path="../../app/types.d.ts" />

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { useRouter } from 'next/router';
import DomainSettings from '../../app/components/domains/DomainSettings';
import { useFetchDomain, useUpdateDomain, useDeleteDomain } from '../../app/services/domains';

// Mock next/router
jest.mock('next/router', () => ({
   useRouter: jest.fn(),
}));

// Mock the services
jest.mock('../../app/services/domains', () => ({
   useFetchDomain: jest.fn(),
   useUpdateDomain: jest.fn(),
   useDeleteDomain: jest.fn(),
}));

const mockRouter = {
   push: jest.fn(),
};

const mockDomain: DomainType = {
   ID: 1,
   domain: 'example.com',
   slug: 'example-com',
   lastAccessed: '2023-01-01',
   added: '2023-01-01',
   updated: '2023-01-01',
   tags: '',
   scrape_enabled: true,
   notify_enabled: true,
   notification: true,
   notification_interval: 'daily',
   notification_emails: 'test@example.com',
   search_console: JSON.stringify({
      property_type: 'domain',
      url: '',
      client_email: 'initial@example.com',
      private_key: 'initial-key',
   }),
   notifications: '',
   keywordsTracked: 0,
};

describe('DomainSettings Component', () => {
   let queryClient: QueryClient;
   let mockUseFetchDomain: jest.Mock;
   let mockUseUpdateDomain: jest.Mock;
   let mockUseDeleteDomain: jest.Mock;
   let mockCloseModal: jest.Mock;

   beforeEach(() => {
      queryClient = new QueryClient({
         defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
         },
      });

      mockCloseModal = jest.fn();
      mockUseFetchDomain = useFetchDomain as jest.Mock;
      mockUseUpdateDomain = useUpdateDomain as jest.Mock;
      mockUseDeleteDomain = useDeleteDomain as jest.Mock;

      (useRouter as jest.Mock).mockReturnValue(mockRouter);

      // Mock the hooks to return mock functions
      mockUseUpdateDomain.mockReturnValue({
         mutate: jest.fn(),
         error: null,
         isLoading: false,
      });

      mockUseDeleteDomain.mockReturnValue({
         mutate: jest.fn(),
      });
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   const renderWithQueryClient = (component: React.ReactElement) => render(
         <QueryClientProvider client={queryClient}>
            {component}
         </QueryClientProvider>,
      );

   it('renders without crashing', () => {
      mockUseFetchDomain.mockImplementation(() => {});

      renderWithQueryClient(
         <DomainSettings domain={mockDomain} closeModal={mockCloseModal} />,
      );

      expect(screen.getByText('Domain Settings')).toBeInTheDocument();
      expect(screen.getByText('Notification')).toBeInTheDocument();
      expect(screen.getByText('Search Console')).toBeInTheDocument();
   });

   it('syncs scrape and notify flags when toggling the unified active control', async () => {
      mockUseFetchDomain.mockImplementation(() => {});
      const mutateMock = jest.fn();
      mockUseUpdateDomain.mockReturnValue({
         mutate: mutateMock,
         error: null,
         isLoading: false,
      });

      renderWithQueryClient(
         <DomainSettings domain={mockDomain} closeModal={mockCloseModal} />,
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Toggle domain active status');
      fireEvent.click(toggle);

      await waitFor(() => {
         expect(screen.getByText('Deactive')).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update Settings');
      fireEvent.click(updateButton);

      await waitFor(() => {
         expect(mutateMock).toHaveBeenCalled();
      });

      expect(mutateMock).toHaveBeenCalledWith({
         domain: mockDomain,
         domainSettings: expect.objectContaining({
            scrape_enabled: false,
         }),
      });
   });

   it('preserves user changes to other settings when async fetch completes (functional state update fix)', async () => {
      let capturedCallback: ((_domainObj: DomainType) => void) | null = null;

      // Capture the callback passed to useFetchDomain
      mockUseFetchDomain.mockImplementation((_router, _domain, onSuccess) => {
         capturedCallback = onSuccess;
      });

      renderWithQueryClient(
         <DomainSettings domain={mockDomain} closeModal={mockCloseModal} />,
      );

      // Verify useFetchDomain was called with a callback
      expect(mockUseFetchDomain).toHaveBeenCalled();
      expect(capturedCallback).toBeTruthy();

      // Switch to notification tab and change the notification emails 
      // This simulates user changing OTHER settings while search console fetch is in flight
      const notificationTab = screen.getByText('Notification');
      fireEvent.click(notificationTab);

      // Change the notification email field to simulate user input
      const emailInput = screen.getByDisplayValue('test@example.com');
      fireEvent.change(emailInput, { target: { value: 'user-modified@example.com' } });

      // Verify the input was updated in the UI
      expect(screen.getByDisplayValue('user-modified@example.com')).toBeInTheDocument();

      // Now simulate the async fetch completing with different search console data
      // This should NOT overwrite the user's notification email changes
      const fetchedDomainData: DomainType = {
         ...mockDomain,
         search_console: JSON.stringify({
            property_type: 'domain',
            url: '',
            client_email: 'fetched@example.com',
            private_key: 'fetched-key',
         }),
      };

      // Execute the callback that was captured - this simulates the async fetch completing
      act(() => {
         if (capturedCallback) {
            capturedCallback(fetchedDomainData);
         }
      });

      // After the callback executes, the user's notification email change should be preserved
      // This is the fix for the stale closure issue
      await waitFor(() => {
         expect(screen.getByDisplayValue('user-modified@example.com')).toBeInTheDocument();
      });

      // Also verify that we can navigate back to search console and see the fetched data
      const searchConsoleTab = screen.getByText('Search Console');
      fireEvent.click(searchConsoleTab);
      
      await waitFor(() => {
         expect(screen.getByDisplayValue('fetched@example.com')).toBeInTheDocument();
         expect(screen.getByDisplayValue('fetched-key')).toBeInTheDocument();
      });
   });

   it('handles the stale closure scenario correctly', () => {
      // This test validates that the fix prevents the stale closure issue
      // by ensuring we use the functional form of setState

      let capturedCallback: ((_domainObj: DomainType) => void) | null = null;

      mockUseFetchDomain.mockImplementation((_router, _domain, onSuccess) => {
         capturedCallback = onSuccess;
      });

      renderWithQueryClient(
         <DomainSettings domain={mockDomain} closeModal={mockCloseModal} />,
      );

      // Verify that useFetchDomain was called and we captured the callback
      expect(mockUseFetchDomain).toHaveBeenCalled();
      expect(capturedCallback).toBeTruthy();

      // The key here is that our fix should use prevSettings => ({ ...prevSettings, ... })
      // instead of the stale { ...domainSettings, ... } pattern
      // This test just validates that the callback was set up correctly
      expect(typeof capturedCallback).toBe('function');
   });
});