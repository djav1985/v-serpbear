import { fireEvent, render, screen } from '@testing-library/react';
import AddKeywords from '../../components/keywords/AddKeywords';
import { useAddKeywords } from '../../services/keywords';

jest.mock('../../services/keywords', () => ({ useAddKeywords: jest.fn() }));

describe('AddKeywords', () => {
   const addMutate = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      (useAddKeywords as unknown as jest.Mock).mockReturnValue({ mutate: addMutate, isLoading: false });
   });

   it('rejects more than 100 generated keyword rows without silently truncating', () => {
      render(<AddKeywords keywords={[]} scraperName="SerpApi" allowsCity={false} closeModal={jest.fn()} domain="example.com" />);
      const lines = Array.from({ length: 101 }, (_, index) => `keyword ${index + 1}`).join('\n');
      fireEvent.change(screen.getByPlaceholderText('Type or Paste Keywords here. Insert Each keyword in a New line.'), { target: { value: lines } });
      fireEvent.click(screen.getByRole('button', { name: 'Add Keywords' }));

      expect(screen.getByText('You can add at most 100 keyword and device combinations at once.')).toBeInTheDocument();
      expect(addMutate).not.toHaveBeenCalled();
   });
});
