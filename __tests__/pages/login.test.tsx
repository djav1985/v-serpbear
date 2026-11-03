import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import Login from '../../pages/login';
import { AUTH_QUERY_KEY } from '../../hooks/useAuth';
import { apiPost } from '../../utils/client/apiClient';

const pushMock = jest.fn();
jest.mock('next/router', () => ({
   useRouter: () => ({ push: pushMock, pathname: '/login' }),
}));

jest.mock('../../hooks/useBranding', () => ({
   useBranding: () => ({ branding: { platformName: 'SerpBear' } }),
}));

jest.mock('../../components/common/Branding', () => ({
   BrandTitle: () => null,
}));

jest.mock('../../utils/client/apiClient', () => {
   const actual = jest.requireActual('../../utils/client/apiClient');
   return { ...actual, apiPost: jest.fn() };
});

const apiPostMock = apiPost as jest.Mock;

function renderLogin(queryClient: QueryClient) {
   const utils = render(
      <QueryClientProvider client={queryClient}>
         <Login />
      </QueryClientProvider>,
   );
   const [usernameInput, passwordInput] = Array.from(utils.container.querySelectorAll('input'));
   fireEvent.change(usernameInput, { target: { value: 'admin' } });
   fireEvent.change(passwordInput, { target: { value: 'secret' } });
   fireEvent.click(screen.getByRole('button', { name: 'Login' }));
   return utils;
}

describe('Login page', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('marks the cached auth state as authenticated before navigating home', async () => {
      apiPostMock.mockResolvedValueOnce({ success: true });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      // The auth check ran before login and cached "logged out".
      queryClient.setQueryData(AUTH_QUERY_KEY, { isAuthenticated: false, isLoading: false });

      renderLogin(queryClient);

      await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
      expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual({ isAuthenticated: true, isLoading: false });
      expect(apiPostMock).toHaveBeenCalledWith('/api/login', { username: 'admin', password: 'secret' });
   });

   it('keeps the user on the login page and leaves the cache alone when login fails', async () => {
      apiPostMock.mockRejectedValueOnce(new Error('Invalid credentials'));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(AUTH_QUERY_KEY, { isAuthenticated: false, isLoading: false });

      renderLogin(queryClient);

      await waitFor(() => expect(apiPostMock).toHaveBeenCalled());
      expect(pushMock).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual({ isAuthenticated: false, isLoading: false });
   });
});
