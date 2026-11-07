import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import toast from 'react-hot-toast';
import { apiPost } from '../../utils/client/apiClient';
import { useMutateKeywordsVolume } from '../../services/adwords';

jest.mock('react-hot-toast', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../utils/client/apiClient', () => ({ apiGet: jest.fn(), apiPost: jest.fn(), apiPut: jest.fn() }));

describe('useMutateKeywordsVolume cache behavior', () => {
   const apiPostMock = apiPost as jest.MockedFunction<typeof apiPost>;
   const toastMock = toast as unknown as jest.Mock;

   beforeEach(() => jest.clearAllMocks());

   it('invalidates keyword data when a synchronous volume update completes', async () => {
      apiPostMock.mockResolvedValue({} as never);
      const queryClient = new QueryClient();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => useMutateKeywordsVolume(), { wrapper });

      await act(async () => { await result.current.mutateAsync({ domain: 'example.com' }); });

      expect(invalidate).toHaveBeenCalledWith(['keywords']);
      expect(toastMock).toHaveBeenCalledWith('Keyword Volume Data Loaded Successfully!', { icon: '✔️' });
   });

   it('does not invalidate keyword data before a background update finishes', async () => {
      apiPostMock.mockResolvedValue({ started: true } as never);
      const queryClient = new QueryClient();
      const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
      const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
      const { result } = renderHook(() => useMutateKeywordsVolume(), { wrapper });

      await act(async () => { await result.current.mutateAsync({ domain: 'all' }); });

      expect(invalidate).not.toHaveBeenCalled();
      expect(toastMock).toHaveBeenCalledWith(expect.stringContaining('update started'), { icon: '🔄' });
   });
});
