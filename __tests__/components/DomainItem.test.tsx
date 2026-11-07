import { fireEvent, render, screen } from '@testing-library/react';
import DomainItem from '../../components/domains/DomainItem';
import { dummyDomain } from '../../__mocks__/data';

const toggleMutationMock = jest.fn();
const updateThumbMock = jest.fn();

jest.mock('../../services/domains', () => ({
   useUpdateDomainToggles: jest.fn(() => ({
      mutateAsync: toggleMutationMock,
      isLoading: false,
   })),
}));

jest.mock('react-hot-toast', () => ({
   __esModule: true,
   default: jest.fn(),
}));

const defaultProps = {
   domain: dummyDomain,
   isConsoleIntegrated: false,
   thumb: '',
   updateThumb: updateThumbMock,
   showMapPackStat: true,
};

describe('DomainItem Component', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('renders keywords, average position, and map pack stats', async () => {
      render(<DomainItem {...defaultProps} />);

      const keywordsStat = screen.getByText('Keywords');
      const avgStat = screen.getByText('Avg position');
      const mapPackStat = screen.getByText('Map Pack');

      expect(keywordsStat.parentElement).toHaveTextContent('Keywords10');
      expect(avgStat.parentElement).toHaveTextContent('Avg position24');
      expect(mapPackStat.parentElement).toHaveTextContent('Map Pack3');
   });

   it('shows the average as a whole number, rounded the same way as the email', () => {
      const { unmount } = render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, avgPosition: 4.7 }} />);
      expect(screen.getByText('Avg position').parentElement).toHaveTextContent('Avg position5');
      unmount();

      render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, avgPosition: 3.2 }} />);
      expect(screen.getByText('Avg position').parentElement).toHaveTextContent('Avg position3');
   });

   it('updates domain thumbnail when reload button is clicked', async () => {
      const { container } = render(<DomainItem {...defaultProps} />);
      const reloadThumbBtn = container.querySelector('.domain_thumb button');
      expect(reloadThumbBtn).toBeInTheDocument();
      if (reloadThumbBtn) {
         fireEvent.click(reloadThumbBtn);
      }
      expect(updateThumbMock).toHaveBeenCalledWith(dummyDomain.domain);
   });

   it('does not show the map pack stat when disabled', () => {
      render(<DomainItem {...defaultProps} showMapPackStat={false} />);
      expect(screen.queryByText('Map Pack')).not.toBeInTheDocument();
   });

   it('submits a combined toggle payload', async () => {
      toggleMutationMock.mockResolvedValueOnce(undefined);
      render(<DomainItem {...defaultProps} />);

      const toggle = screen.getByLabelText('Toggle domain active status');
      fireEvent.click(toggle);

      expect(toggleMutationMock).toHaveBeenCalledWith({
         domain: dummyDomain,
         domainSettings: { scrapeEnabled: false },
      });
   });

   it('displays the deactive label when domain toggles are disabled', () => {
      const inactiveDomain = {
         ...dummyDomain,
         scrapeEnabled: false,
         notify_enabled: false,
      };

      render(<DomainItem {...defaultProps} domain={inactiveDomain} />);

      expect(screen.getByText('Deactive')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Toggle domain active status') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
   });

   describe('trend triangles', () => {
      it('colours the triangle by direction, green for improvement and red for decline', () => {
         const cases = [
            { domain: { keywordsTracked: 10, prevKeywordsTracked: 8 }, symbol: '▲', className: 'text-[#5ed7c3]' },
            { domain: { keywordsTracked: 8, prevKeywordsTracked: 10 }, symbol: '▼', className: 'text-red-300' },
            { domain: { avgPosition: 8, prevAvgPosition: 10 }, symbol: '▼', className: 'text-[#5ed7c3]' },
            { domain: { avgPosition: 12, prevAvgPosition: 10 }, symbol: '▲', className: 'text-red-300' },
         ];
         for (const { domain, symbol, className } of cases) {
            const { unmount } = render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, ...domain }} />);
            expect(screen.getByText(symbol)).toHaveClass(className);
            unmount();
         }
      });

      it('shows a triangle for Search Console visits compared with the previous 7 days', () => {
         render(
            <DomainItem
               {...defaultProps}
               isConsoleIntegrated={true}
               domain={{ ...dummyDomain, scVisits: 4, scVisitsPrev: 9 }}
            />
         );

         expect(screen.getByText('▼')).toHaveClass('text-red-300');
      });

      it('shows no triangle without a baseline, for unranked (0) moves, or when unchanged', () => {
         const cases = [
            { keywordsTracked: 10, prevKeywordsTracked: null },
            { avgPosition: 0, prevAvgPosition: 10 },
            { avgPosition: 10, prevAvgPosition: 0 },
            { keywordsTracked: 10, prevKeywordsTracked: 10 },
         ];
         for (const domain of cases) {
            const { unmount } = render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, ...domain }} />);
            expect(screen.queryByText('▲')).not.toBeInTheDocument();
            expect(screen.queryByText('▼')).not.toBeInTheDocument();
            unmount();
         }
      });
   });
});
