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
         notification: false,
      };

      render(<DomainItem {...defaultProps} domain={inactiveDomain} />);

      expect(screen.getByText('Deactive')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Toggle domain active status') as HTMLInputElement;
      expect(toggle.checked).toBe(false);
   });
});
