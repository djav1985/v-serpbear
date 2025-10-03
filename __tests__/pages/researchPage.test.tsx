import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ResearchPage from '../../pages/research';
import { useFetchKeywordIdeas } from '../../services/adwords';
import { useFetchSettings } from '../../services/settings';

jest.mock('next/router', () => ({
   useRouter: () => ({ pathname: '/research', query: {}, push: jest.fn() }),
}));

jest.mock('../../services/adwords', () => ({
   useFetchKeywordIdeas: jest.fn(),
   useMutateKeywordIdeas: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('../../services/settings');

jest.mock('../../components/ideas/KeywordIdeasTable', () => () => <div data-testid="ideas-table" />);

const useFetchKeywordIdeasMock = useFetchKeywordIdeas as jest.Mock;
const useFetchSettingsMock = useFetchSettings as jest.Mock;

const renderPage = () => {
   const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
   });
   return render(
      <QueryClientProvider client={queryClient}>
         <ResearchPage />
      </QueryClientProvider>,
   );
};

describe('Research page Ads integration flag', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      useFetchKeywordIdeasMock.mockReturnValue({
         data: { data: { keywords: [], favorites: [], settings: undefined } },
         isLoading: false,
         isError: false,
      });
   });

   it('disables the load button when Google Ads credentials are incomplete', () => {
      useFetchSettingsMock.mockReturnValue({
         data: { settings: { adwords_refresh_token: 'token', adwords_developer_token: 'dev' } },
         isLoading: false,
      });

      renderPage();

      const loadButton = screen.getByRole('button', { name: /load ideas/i });
      expect(loadButton).toHaveClass('cursor-not-allowed');
   });
});
