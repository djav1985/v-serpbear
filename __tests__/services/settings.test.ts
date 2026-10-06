import { renderHook, act } from '@testing-library/react';
import { useRetryFailedQueue, useSendNotifications } from '../../services/settings';
import React from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import toast from 'react-hot-toast';

// Mock react-hot-toast
jest.mock('react-hot-toast');
const toastMock = toast as jest.MockedFunction<typeof toast>;

// Mock fetch
global.fetch = jest.fn();
const fetchMock = fetch as jest.MockedFunction<typeof fetch>;

const createWrapper = () => {
   const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
   return ({ children }: { children: React.ReactNode }) => React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
   );
};

describe('useRetryFailedQueue', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('stays pending until every targeted keyword stops updating', async () => {
      const response = (body: unknown) => ({
         ok: true,
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue(body),
      } as any);
      fetchMock
         .mockResolvedValueOnce(response({ message: 'Refresh started' }))
         .mockResolvedValueOnce(response({ keywords: [{ ID: 11, updating: true }, { ID: 12, updating: false }] }))
         .mockResolvedValueOnce(response({ keywords: [{ ID: 11, updating: false }] }));

      const wrapper = createWrapper();
      const { result } = renderHook(() => useRetryFailedQueue(), { wrapper });
      let retryPromise!: Promise<void>;

      await act(async () => {
         retryPromise = result.current.mutateAsync([11, 12]);
      });

      await act(async () => {
         await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(result.current.isLoading).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await act(async () => {
         await retryPromise;
      });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.isLoading).toBe(false);
      expect(toastMock).toHaveBeenCalledWith('Failed keyword retries completed', { icon: '✔️' });
   });
});

describe('useSendNotifications success message extraction', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      // Mock successful response from API
      fetchMock.mockResolvedValue({
         ok: true,
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue({ success: true, error: null }),
      } as any);
   });

   it('uses default message when API response has no message property', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useSendNotifications(), { wrapper });

      await act(async () => {
         await result.current.mutate();
      });

      // Verify that toast was called with the default message
      expect(toastMock).toHaveBeenCalledWith('Notifications Sent!', { icon: '✔️' });
   });

   it('uses custom message when API response includes message property', async () => {
      // Mock API response with custom message
      fetchMock.mockResolvedValue({
         ok: true,
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue({ 
            success: true, 
            error: null, 
            message: 'Custom success message!' 
         }),
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSendNotifications(), { wrapper });

      await act(async () => {
         await result.current.mutate();
      });

      // Verify that toast was called with the custom message
      expect(toastMock).toHaveBeenCalledWith('Custom success message!', { icon: '✔️' });
   });

   it('handles null/undefined response gracefully', async () => {
      // Mock API response that returns null
      fetchMock.mockResolvedValue({
         ok: true,
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue(null),
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSendNotifications(), { wrapper });

      await act(async () => {
         await result.current.mutate();
      });

      // Verify that toast was called with the default message
      expect(toastMock).toHaveBeenCalledWith('Notifications Sent!', { icon: '✔️' });
   });

   it('handles response with empty message property', async () => {
      // Mock API response with empty message
      fetchMock.mockResolvedValue({
         ok: true,
         status: 200,
         headers: { get: jest.fn().mockReturnValue(null) },
         json: jest.fn().mockResolvedValue({ 
            success: true, 
            error: null, 
            message: '' 
         }),
      } as any);

      const wrapper = createWrapper();
      const { result } = renderHook(() => useSendNotifications(), { wrapper });

      await act(async () => {
         await result.current.mutate();
      });

      // Verify that toast was called with the default message since empty string is falsy
      expect(toastMock).toHaveBeenCalledWith('Notifications Sent!', { icon: '✔️' });
   });
});

describe('useSendNotifications structured error extraction', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('extracts message from structured error envelope on failure', async () => {
      const structuredEnvelope = { error: { code: 'INTERNAL_SERVER_ERROR', message: 'All notification emails failed to send. Please check your SMTP configuration.' } };
      (global.fetch as jest.Mock).mockResolvedValue({
         ok: false,
         status: 500,
         headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
         json: jest.fn().mockResolvedValue(structuredEnvelope),
      } as any);

      const wrapper = createWrapper();
      const { renderHook, act } = require('@testing-library/react');
      const { useSendNotifications } = require('../../services/settings');
      const { result } = renderHook(() => useSendNotifications(), { wrapper });

      let caughtMessage = '';
      await act(async () => {
         try {
            await result.current.mutateAsync();
         } catch (error) {
            caughtMessage = (error as Error).message;
         }
      });

      expect(caughtMessage).toBe('All notification emails failed to send. Please check your SMTP configuration.');
      expect(toastMock).toHaveBeenCalledWith('All notification emails failed to send. Please check your SMTP configuration.', { icon: '⚠️' });
   });
});
