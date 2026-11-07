import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { sortInsightItems } from '../../utils/insight';
import SCInsight from '../../components/insight/Insight';

jest.mock('../../hooks/useIsMobile', () => () => [false]);
jest.mock('react-chartjs-2', () => ({ Line: () => null }));
jest.mock('../../utils/insight', () => {
   const actual = jest.requireActual('../../utils/insight');
   return { ...actual, sortInsightItems: jest.fn(actual.sortInsightItems) };
});

describe('SCInsight', () => {
   it('memoizes sorted rows for the active tab and does not mutate source arrays', () => {
      const keywordItems: SCInsightItem[] = [
         { keyword: 'lower clicks', clicks: 1, impressions: 10, ctr: 10, position: 2 },
         { keyword: 'higher clicks', clicks: 3, impressions: 20, ctr: 15, position: 1 },
      ];
      const sourceOrder = [...keywordItems];
      const insight: InsightDataType = {
         stats: [],
         keywords: keywordItems,
         countries: [],
         pages: [],
      };
      const sortSpy = sortInsightItems as jest.Mock;
      const props = { insight, isLoading: false, isConsoleIntegrated: true, domain: null };
      const view = render(<SCInsight {...props} />);

      fireEvent.click(screen.getByText('keywords'));
      expect(sortSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText('higher clicks')).toBeInTheDocument();
      expect(keywordItems).toEqual(sourceOrder);

      view.rerender(<SCInsight {...props} isLoading />);
      expect(sortSpy).toHaveBeenCalledTimes(1);
      sortSpy.mockRestore();
   });
});
