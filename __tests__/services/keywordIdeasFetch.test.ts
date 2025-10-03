import { useQuery } from '@tanstack/react-query';
import { useFetchKeywordIdeas } from '../../services/adwords';

jest.mock('@tanstack/react-query', () => ({
   useQuery: jest.fn(),
}));

describe('useFetchKeywordIdeas', () => {
   const useQueryMock = useQuery as unknown as jest.Mock;

   beforeEach(() => {
      useQueryMock.mockClear();
      useQueryMock.mockReturnValue({ data: null });
   });

   it('disables the query when Ads is disconnected', () => {
      const router = { pathname: '/domain/ideas/example', query: { slug: 'example' } } as any;

      useFetchKeywordIdeas(router, false);

      expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({
         queryKey: ['keywordIdeas', 'example'],
         enabled: false,
         retry: false,
      }));
   });

   it('disables the research query when Ads is disconnected', () => {
      const router = { pathname: '/research', query: {} } as any;

      useFetchKeywordIdeas(router, false);

      expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({
         queryKey: ['keywordIdeas', 'research'],
         enabled: false,
         retry: false,
      }));
   });

   it('enables keyword ideas when Ads is connected', () => {
      const router = { pathname: '/domain/ideas/example', query: { slug: 'example' } } as any;

      useFetchKeywordIdeas(router, true);

      expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({
         queryKey: ['keywordIdeas', 'example'],
         enabled: true,
         retry: false,
      }));
   });
});
