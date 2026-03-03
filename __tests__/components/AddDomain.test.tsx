import { fireEvent, render, screen } from '@testing-library/react';
import AddDomain from '../../components/domains/AddDomain';
import { useAddDomain } from '../../services/domains';

jest.mock('../../services/domains', () => ({
   useAddDomain: jest.fn(),
}));

const mockUseAddDomain = useAddDomain as unknown as jest.Mock;

const baseDomain: DomainType = {
   ID: 1,
   domain: 'existing.com',
   slug: 'existing-com',
   notification_interval: 'daily',
   notification_emails: '',
   lastUpdated: '2024-01-01T00:00:00.000Z',
   added: '2024-01-01T00:00:00.000Z',
};

describe('AddDomain', () => {
   const mutateMock = jest.fn();
   const closeModalMock = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mutateMock.mockReset();
      mockUseAddDomain.mockReturnValue({ mutate: mutateMock, isLoading: false });
   });

   const renderComponent = (domains: DomainType[] = [baseDomain]) => render(
      <AddDomain domains={domains} closeModal={closeModalMock} />,
   );

   it('deduplicates submitted domains before triggering the mutation', () => {
      renderComponent();

      const textarea = screen.getByPlaceholderText(/Type or Paste URLs here/i);
      fireEvent.change(textarea, {
         target: {
            value: 'https://example.com/\nhttps://example.com/\nhttps://existing.com/',
         },
      });

      const addButton = screen.getByText('Add Domain');
      fireEvent.click(addButton);

      expect(mutateMock).toHaveBeenCalledWith(['example.com']);
   });

   it('surfaces a warning when all provided domains are duplicates', () => {
      renderComponent();

      const textarea = screen.getByPlaceholderText(/Type or Paste URLs here/i);
      fireEvent.change(textarea, {
         target: { value: 'https://existing.com/' },
      });

      const addButton = screen.getByText('Add Domain');
      fireEvent.click(addButton);

      expect(mutateMock).not.toHaveBeenCalled();
      expect(screen.getByText('All provided domains are already tracked or duplicates.')).toBeInTheDocument();
   });
});
