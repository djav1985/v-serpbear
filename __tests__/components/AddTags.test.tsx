import { fireEvent, render, screen } from '@testing-library/react';
import AddTags from '../../components/keywords/AddTags';
import { useUpdateKeywordTags } from '../../services/keywords';

jest.mock('../../services/keywords', () => ({
   useUpdateKeywordTags: jest.fn(),
}));

const mockUseUpdateKeywordTags = useUpdateKeywordTags as unknown as jest.Mock;

const baseKeyword: KeywordType = {
   ID: 1,
   keyword: 'alpha keyword',
   device: 'desktop',
   country: 'US',
   domain: 'example.com',
   lastUpdated: '2024-01-01T00:00:00.000Z',
   added: '2024-01-01T00:00:00.000Z',
   position: 5,
   volume: 100,
   sticky: false,
   history: {},
   lastResult: [],
   url: '',
   tags: [],
   updating: false,
   lastUpdateError: false,
};

describe('AddTags', () => {
   const mutateMock = jest.fn();
   const closeModal = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mutateMock.mockReset();
      mockUseUpdateKeywordTags.mockReturnValue({ mutate: mutateMock });
   });

   it('filters out blank tag entries before submitting', () => {
      render(
         <AddTags keywords={[baseKeyword]} existingTags={[]} closeModal={closeModal} />,
      );

      const input = screen.getByPlaceholderText('Insert Tags. eg: tag1, tag2');
      fireEvent.change(input, { target: { value: 'primary, ,  , secondary  ' } });

      const applyButton = screen.getByText('Apply');
      fireEvent.click(applyButton);

      expect(mutateMock).toHaveBeenCalledWith({ tags: { 1: ['primary', 'secondary'] } });
   });

   it('merges new tags with existing tags for a single keyword in add mode', () => {
      const keywordWithTags = { ...baseKeyword, tags: ['SEO', 'content'] };
      render(
         <AddTags keywords={[keywordWithTags]} existingTags={['SEO', 'content']} closeModal={closeModal} />,
      );

      const input = screen.getByPlaceholderText('Insert Tags. eg: tag1, tag2');
      fireEvent.change(input, { target: { value: 'PPC' } });

      const applyButton = screen.getByText('Apply');
      fireEvent.click(applyButton);

      expect(mutateMock).toHaveBeenCalledWith({ tags: { 1: ['SEO', 'content', 'PPC'] } });
   });

   it('removes matching tags across selected keywords in remove mode', () => {
      const secondKeyword = {
         ...baseKeyword,
         ID: 2,
         keyword: 'beta keyword',
         tags: ['Charlotte', 'PPC'],
      };

      render(
         <AddTags
            mode='remove'
            keywords={[{ ...baseKeyword, tags: ['SEO', 'Charlotte'] }, secondKeyword]}
            existingTags={['SEO', 'Charlotte', 'PPC']}
            closeModal={closeModal}
         />,
      );

      const input = screen.getByPlaceholderText('Remove Tags. eg: tag1, tag2');
      fireEvent.change(input, { target: { value: 'seo' } });

      const applyButton = screen.getByText('Apply');
      fireEvent.click(applyButton);

      expect(mutateMock).toHaveBeenCalledWith({ tags: { 1: ['Charlotte'], 2: ['Charlotte', 'PPC'] } });
   });
});
