import { renderHook, act } from '@testing-library/react';
import { useSendNotifications } from '../../services/settings';
import { createWrapper } from '../../__mocks__/utils';
import toast from 'react-hot-toast';

// Mock react-hot-toast
jest.mock('react-hot-toast');
const toastMock = toast as jest.MockedFunction<typeof toast>;

// Mock fetch
global.fetch = jest.fn();
const fetchMock = fetch as jest.MockedFunction<typeof fetch>;

describe('useSendNotifications success message extraction', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      // Mock successful response from API
      fetchMock.mockResolvedValue({
         ok: true,
         status: 200,
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