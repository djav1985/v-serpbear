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
   selected: false,
   isConsoleIntegrated: false,
   thumb: '',
   updateThumb: updateThumbMock,
   screenshotsEnabled: true,
   showMapPackStat: true,
};

describe('DomainItem Component', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('renders without crashing', async () => {
      const { container } = render(<DomainItem {...defaultProps} />);
      expect(container.querySelector('.domItem')).toBeInTheDocument();
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

   it('updates domain thumbnail when reload button is clicked', async () => {
      const { container } = render(<DomainItem {...defaultProps} />);
      const reloadThumbBtn = container.querySelector('.domain_thumb button');
      expect(reloadThumbBtn).toBeInTheDocument();
      if (reloadThumbBtn) {
         fireEvent.click(reloadThumbBtn);
      }
      expect(updateThumbMock).toHaveBeenCalledWith(dummyDomain.domain);
   });

   it('hides screenshot reload button when screenshots are disabled', () => {
      const { container } = render(<DomainItem {...defaultProps} screenshotsEnabled={false} />);
      expect(container.querySelector('.domain_thumb button')).not.toBeInTheDocument();
   });

   it('does not show the map pack stat when disabled', () => {
      render(<DomainItem {...defaultProps} showMapPackStat={false} />);
      expect(screen.queryByText('Map Pack')).not.toBeInTheDocument();
   });

   it('renders the unified active toggle', () => {
      render(<DomainItem {...defaultProps} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle domain active status')).toBeInTheDocument();
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
      it('shows a green up triangle when keywords increased since the last refresh', () => {
         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, keywordsTracked: 10, prevKeywordsTracked: 8 }} />);

         const triangle = screen.getByText('▲');
         expect(triangle).toHaveClass('text-[#5ed7c3]');
      });

      it('shows a red down triangle when keywords decreased since the last refresh', () => {
         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, keywordsTracked: 8, prevKeywordsTracked: 10 }} />);

         const triangle = screen.getByText('▼');
         expect(triangle).toHaveClass('text-red-300');
      });

      it('shows a green down triangle when avg position improved (lower is better)', () => {
         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, avgPosition: 8, prevAvgPosition: 10 }} />);

         const triangle = screen.getByText('▼');
         expect(triangle).toHaveClass('text-[#5ed7c3]');
      });

      it('shows a red up triangle when avg position got worse (lower is better)', () => {
         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, avgPosition: 12, prevAvgPosition: 10 }} />);

         const triangle = screen.getByText('▲');
         expect(triangle).toHaveClass('text-red-300');
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

      it('shows no triangle when there is no baseline (null previous value)', () => {
         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, keywordsTracked: 10, prevKeywordsTracked: null }} />);

         expect(screen.queryByText('▲')).not.toBeInTheDocument();
         expect(screen.queryByText('▼')).not.toBeInTheDocument();
      });

      it('shows no triangle when avg position moves to or from unranked (0)', () => {
         const { unmount } = render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, avgPosition: 0, prevAvgPosition: 10 }} />);
         expect(screen.queryByText('▲')).not.toBeInTheDocument();
         expect(screen.queryByText('▼')).not.toBeInTheDocument();
         unmount();

         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, avgPosition: 10, prevAvgPosition: 0 }} />);
         expect(screen.queryByText('▲')).not.toBeInTheDocument();
         expect(screen.queryByText('▼')).not.toBeInTheDocument();
      });

      it('shows no triangle when the value is unchanged', () => {
         render(<DomainItem {...defaultProps} domain={{ ...dummyDomain, keywordsTracked: 10, prevKeywordsTracked: 10 }} />);

         expect(screen.queryByText('▲')).not.toBeInTheDocument();
         expect(screen.queryByText('▼')).not.toBeInTheDocument();
      });
   });
});
