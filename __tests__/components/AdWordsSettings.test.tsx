import { act, render, waitFor } from '@testing-library/react';
import AdWordsSettings from '../../app/components/settings/AdWordsSettings';

const toastMock = jest.fn();

jest.mock('react-hot-toast', () => ({
   __esModule: true,
   default: (...args: unknown[]) => toastMock(...args),
}));

const mutateMock = jest.fn();

jest.mock('../../app/services/adwords', () => ({
   useTestAdwordsIntegration: jest.fn(() => ({ mutate: mutateMock, isLoading: false })),
   useMutateKeywordsVolume: jest.fn(() => ({ mutate: mutateMock, isLoading: false })),
}));

// Mock window.history.replaceState
const mockReplaceState = jest.fn();
Object.defineProperty(window, 'history', {
   value: { replaceState: mockReplaceState },
   writable: true,
});

describe('AdWordsSettings postMessage integration', () => {
   const baseSettings = {
      adwords_client_id: 'client',
      adwords_client_secret: 'secret',
      adwords_developer_token: 'dev',
      adwords_account_id: '123-456-7890',
      adwords_refresh_token: 'token',
      keywordsColumns: [],
   } as any;

   const noop = () => undefined;

   beforeEach(() => {
      jest.clearAllMocks();
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
      const performUpdate = jest.fn().mockResolvedValue(undefined);
      render(
         <AdWordsSettings
            settings={baseSettings}
            settingsError={null}
            updateSettings={noop}
            performUpdate={performUpdate}
            closeSettings={noop}
         />,
      );

      await act(async () => {
         window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { type: 'adwordsIntegrated', status: 'success' },
         }));
      });

      await waitFor(() => {
         expect(performUpdate).toHaveBeenCalled();
      });
      expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
   });

   it('shows the upstream error message when integration fails', async () => {
      render(
         <AdWordsSettings
            settings={baseSettings}
            settingsError={null}
            updateSettings={noop}
            performUpdate={noop}
            closeSettings={noop}
         />,
      );

      const detail = 'Custom integration error';
      await act(async () => {
         window.dispatchEvent(new MessageEvent('message', {
            origin: window.location.origin,
            data: { type: 'adwordsIntegrated', status: 'error', message: detail },
         }));
      });

      expect(toastMock).toHaveBeenCalledWith(detail, { icon: '⚠️' });
   });

   describe('URL parameter handling (fallback integration)', () => {
      it('handles successful integration via URL parameters', async () => {
         const performUpdate = jest.fn().mockResolvedValue(undefined);
         
         // Mock URL with success parameters
         Object.defineProperty(window, 'location', {
            value: {
               ...window.location,
               search: '?ads=integrated&status=success',
               href: 'http://localhost:3000?ads=integrated&status=success',
            },
            writable: true,
         });

         render(
            <AdWordsSettings
               settings={baseSettings}
               settingsError={null}
               updateSettings={noop}
               performUpdate={performUpdate}
               closeSettings={noop}
            />,
         );

         await waitFor(() => {
            expect(performUpdate).toHaveBeenCalled();
         });
         expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
         expect(mockReplaceState).toHaveBeenCalledWith({}, document.title, 'http://localhost:3000/');
      });

      it('handles failed integration via URL parameters with custom error message', async () => {
         const errorMessage = 'Custom error from redirect';
         
         // Mock URL with error parameters
         Object.defineProperty(window, 'location', {
            value: {
               ...window.location,
               search: `?ads=integrated&status=error&detail=${encodeURIComponent(errorMessage)}`,
               href: `http://localhost:3000?ads=integrated&status=error&detail=${encodeURIComponent(errorMessage)}`,
            },
            writable: true,
         });

         render(
            <AdWordsSettings
               settings={baseSettings}
               settingsError={null}
               updateSettings={noop}
               performUpdate={noop}
               closeSettings={noop}
            />,
         );

         await waitFor(() => {
            expect(toastMock).toHaveBeenCalledWith(errorMessage, { icon: '⚠️' });
         });
         expect(mockReplaceState).toHaveBeenCalledWith({}, document.title, 'http://localhost:3000/');
      });

      it('handles failed integration via URL parameters with default error message', async () => {
         // Mock URL with error parameters but no detail
         Object.defineProperty(window, 'location', {
            value: {
               ...window.location,
               search: '?ads=integrated&status=error',
               href: 'http://localhost:3000?ads=integrated&status=error',
            },
            writable: true,
         });

         render(
            <AdWordsSettings
               settings={baseSettings}
               settingsError={null}
               updateSettings={noop}
               performUpdate={noop}
               closeSettings={noop}
            />,
         );

         await waitFor(() => {
            expect(toastMock).toHaveBeenCalledWith('Google Ads integration failed. Please try again.', { icon: '⚠️' });
         });
         expect(mockReplaceState).toHaveBeenCalledWith({}, document.title, 'http://localhost:3000/');
      });

      it('ignores URL parameters when ads parameter is not "integrated"', async () => {
         const performUpdate = jest.fn().mockResolvedValue(undefined);
         
         // Mock URL with non-integration parameters
         Object.defineProperty(window, 'location', {
            value: {
               ...window.location,
               search: '?ads=other&status=success',
               href: 'http://localhost:3000?ads=other&status=success',
            },
            writable: true,
         });

         render(
            <AdWordsSettings
               settings={baseSettings}
               settingsError={null}
               updateSettings={noop}
               performUpdate={performUpdate}
               closeSettings={noop}
            />,
         );

         // Give it time to process any URL parameters
         await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
         });

         expect(performUpdate).not.toHaveBeenCalled();
         expect(toastMock).not.toHaveBeenCalled();
         expect(mockReplaceState).not.toHaveBeenCalled();
      });

      it('ignores URL parameters when status parameter is missing', async () => {
         const performUpdate = jest.fn().mockResolvedValue(undefined);
         
         // Mock URL with missing status parameter
         Object.defineProperty(window, 'location', {
            value: {
               ...window.location,
               search: '?ads=integrated',
               href: 'http://localhost:3000?ads=integrated',
            },
            writable: true,
         });

         render(
            <AdWordsSettings
               settings={baseSettings}
               settingsError={null}
               updateSettings={noop}
               performUpdate={performUpdate}
               closeSettings={noop}
            />,
         );

         // Give it time to process any URL parameters
         await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
         });

         expect(performUpdate).not.toHaveBeenCalled();
         expect(toastMock).not.toHaveBeenCalled();
         expect(mockReplaceState).not.toHaveBeenCalled();
      });

      it('preserves other URL parameters when cleaning up integration params', async () => {
         // Mock URL with integration params and other params
         Object.defineProperty(window, 'location', {
            value: {
               ...window.location,
               search: '?ads=integrated&status=success&other=value&keep=this',
               href: 'http://localhost:3000?ads=integrated&status=success&other=value&keep=this',
            },
            writable: true,
         });

         render(
            <AdWordsSettings
               settings={baseSettings}
               settingsError={null}
               updateSettings={noop}
               performUpdate={noop}
               closeSettings={noop}
            />,
         );

         await waitFor(() => {
            expect(toastMock).toHaveBeenCalledWith('Google Ads has been integrated successfully!', { icon: '✔️' });
         });
         expect(mockReplaceState).toHaveBeenCalledWith({}, document.title, 'http://localhost:3000/?other=value&keep=this');
      });
   });
});
