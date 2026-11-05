/// <reference path="../../types.d.ts" />

import { render, screen } from '@testing-library/react';
import KeywordDetails from '../../components/keywords/KeywordDetails';
import { useFetchSingleKeyword } from '../../services/keywords';
import { dummyKeywords } from '../../__mocks__/data';

jest.mock('../../services/keywords', () => ({
   useFetchSingleKeyword: jest.fn(),
}));

jest.mock('../../components/common/Chart', () => () => <div data-testid="chart" />);

jest.mock('../../components/common/SelectField', () => ({ updateField }: any) => (
   <button type="button" data-testid="chart-range" onClick={() => updateField(['7'])}>
      Change Range
   </button>
));

jest.mock('../../hooks/useOnKey', () => jest.fn());

const useFetchSingleKeywordMock = useFetchSingleKeyword as unknown as jest.Mock;

describe('KeywordDetails', () => {
   it('falls back to stored keyword.lastResult when no fresh data or no fresh search results are returned', () => {
      const cases = [
         { data: undefined },
         { data: { history: dummyKeywords[0].history } },
      ];
      for (const { data } of cases) {
         useFetchSingleKeywordMock.mockReturnValue({ data });

         const { unmount } = render(<KeywordDetails keyword={dummyKeywords[0] as KeywordType} closeDetails={jest.fn()} />);

         expect(screen.getByText('1. Compress Image Tool')).toBeInTheDocument();
         expect(screen.getByText('https://compressimage.io/')).toBeInTheDocument();
         unmount();
      }
   });

   it('shows "No Results" when position is 0 and no results are skipped', () => {
      useFetchSingleKeywordMock.mockReturnValue({ data: undefined });
      const keyword = { ...dummyKeywords[0], position: 0, lastResult: [] } as KeywordType;

      render(<KeywordDetails keyword={keyword} closeDetails={jest.fn()} />);

      expect(screen.getByText('No Results')).toBeInTheDocument();
   });

   it('shows "Not in First N" when position is 0 and some results were skipped', () => {
      useFetchSingleKeywordMock.mockReturnValue({ data: undefined });
      const keyword = {
         ...dummyKeywords[0],
         position: 0,
         lastResult: [
            { position: 1, url: 'https://a.com/', title: 'A' },
            { position: 2, url: 'https://b.com/', title: 'B' },
            { position: 11, url: '', title: '', skipped: true },
            { position: 12, url: '', title: '', skipped: true },
         ],
      } as KeywordType;

      render(<KeywordDetails keyword={keyword} closeDetails={jest.fn()} />);

      expect(screen.getByText('Not in First 2')).toBeInTheDocument();
   });

   it('renders skipped segment blocks between real results', () => {
      useFetchSingleKeywordMock.mockReturnValue({ data: undefined });
      const keyword = {
         ...dummyKeywords[0],
         position: 15,
         lastResult: [
            { position: 1, url: 'https://a.com/', title: 'Result A' },
            { position: 11, url: '', title: '', skipped: true },
            { position: 12, url: '', title: '', skipped: true },
            { position: 13, url: '', title: '', skipped: true },
            { position: 15, url: 'https://compressimage.io/', title: 'Result B' },
         ],
      } as KeywordType;

      render(<KeywordDetails keyword={keyword} closeDetails={jest.fn()} />);

      expect(screen.getByText('1. Result A')).toBeInTheDocument();
      expect(screen.getByText('15. Result B')).toBeInTheDocument();
      expect(screen.getByText(/3 results skipped/)).toBeInTheDocument();
   });

   it('shows scraped/skipped info banner when skipped results are present', () => {
      useFetchSingleKeywordMock.mockReturnValue({ data: undefined });
      const keyword = {
         ...dummyKeywords[0],
         position: 0,
         lastResult: [
            { position: 1, url: 'https://a.com/', title: 'A' },
            { position: 11, url: '', title: '', skipped: true },
         ],
      } as KeywordType;

      render(<KeywordDetails keyword={keyword} closeDetails={jest.fn()} />);

      expect(screen.getByText(/1 result scraped/)).toBeInTheDocument();
      expect(screen.getByText(/1 position skipped/)).toBeInTheDocument();
   });

   it('does not show info banner when there are no skipped results', () => {
      useFetchSingleKeywordMock.mockReturnValue({ data: undefined });

      render(<KeywordDetails keyword={dummyKeywords[0] as KeywordType} closeDetails={jest.fn()} />);

      expect(screen.queryByText(/scraped/)).not.toBeInTheDocument();
   });
});

describe('KeywordDetails local results panel', () => {
   const renderWithLocal = (localResults: unknown[]) => {
      useFetchSingleKeywordMock.mockReturnValue({ data: undefined });
      const keyword = { ...dummyKeywords[0], localResults } as unknown as KeywordType;
      return render(<KeywordDetails keyword={keyword} closeDetails={jest.fn()} />);
   };

   it('shows every local result in a yellow box, and only the tracked business in green', () => {
      renderWithLocal([
         { position: 1, title: 'CeJay Websites', url: 'https://cejaywebsites.com/', isOwn: false },
         { position: 2, title: 'Vontainment', url: 'https://vontainment.com/', isOwn: true },
         { position: 3, title: 'US Web Central', url: 'https://uswebcentral.com/', isOwn: false },
      ]);

      const box = (title: string) => screen.getByText(title).closest('[data-own]') as HTMLElement;
      expect(box('1. CeJay Websites')).toHaveClass('bg-yellow-50');
      expect(box('3. US Web Central')).toHaveClass('bg-yellow-50');
      expect(box('2. Vontainment')).toHaveClass('bg-green-50');
      expect(box('2. Vontainment')).not.toHaveClass('bg-yellow-50');
   });

   it('keeps all boxes yellow when none is the tracked business, or the results are older and have no flag', () => {
      renderWithLocal([
         { position: 1, title: 'A', url: 'https://a.example/' },
         { position: 2, title: 'B', url: 'https://b.example/', isOwn: false },
      ]);

      expect(screen.getByText('1. A').closest('[data-own]')).toHaveClass('bg-yellow-50');
      expect(screen.getByText('2. B').closest('[data-own]')).toHaveClass('bg-yellow-50');
   });
});
