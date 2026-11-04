/// <reference path="../../types.d.ts" />

/**
 * Behavior tests for UI primitives (Icon, Modal, ToggleField, toggle styles)
 * and the AddDomain / AddTags forms.
 */

jest.mock('../../services/domains', () => ({
   useAddDomain: jest.fn(),
}));

jest.mock('../../services/keywords', () => ({
   useUpdateKeywordTags: jest.fn(),
}));

import { render, fireEvent, screen } from '@testing-library/react';
import Icon from '../../components/common/Icon';
import Modal from '../../components/common/Modal';
import ToggleField from '../../components/common/ToggleField';
import { TOGGLE_TRACK_CLASS_NAME } from '../../components/common/toggleStyles';
import AddDomain from '../../components/domains/AddDomain';
import AddTags from '../../components/keywords/AddTags';
import { useAddDomain } from '../../services/domains';
import { useUpdateKeywordTags } from '../../services/keywords';

describe('Icon Component', () => {
   it('returns null when icon type is unknown', async () => {
       render(<Icon type='unknown-icon' size={24} />);
       expect(document.querySelector('svg')).not.toBeInTheDocument();
   });

   it('renders title element when title prop is provided', async () => {
       render(<Icon type='logo' size={24} title="Test Title" />);
       const titleElement = document.querySelector('svg title');
       expect(titleElement).toBeInTheDocument();
       expect(titleElement?.textContent).toBe('Test Title');
   });

   it('does not render title element when title prop is empty', async () => {
       render(<Icon type='logo' size={24} title="" />);
       const titleElement = document.querySelector('svg title');
       expect(titleElement).not.toBeInTheDocument();
   });
});

const closeModalMock = jest.fn();
describe('Modal Component', () => {
   it('renders the given content and title', async () => {
      const cases = [
         {
            element: <Modal closeModal={closeModalMock}><div><h1>Hello Modal!!</h1></div></Modal>,
            text: 'Hello Modal!!',
         },
         {
            element: <Modal closeModal={closeModalMock} title="Sample Modal Title"><p>Some Modal Content</p></Modal>,
            text: 'Sample Modal Title',
         },
      ];
      for (const { element, text } of cases) {
         const { unmount } = render(element);
         expect(await screen.findByText(text)).toBeInTheDocument();
         unmount();
      }
   });
   it('Closes the modal on close button click', async () => {
      const { container } = render(
         <Modal closeModal={closeModalMock} title="Sample Modal Title">
            <p>Some Modal Content</p>
         </Modal>,
      );
      const closeBtn = container.querySelector('.modal-close');
      if (closeBtn) fireEvent.click(closeBtn);
      expect(closeModalMock).toHaveBeenCalled();
   });
});

describe('ToggleField Component', () => {
   it('does not call onChange when disabled toggle is clicked', () => {
      const mockOnChange = jest.fn();
      render(
         <ToggleField
            label="Test Toggle"
            value={false}
            onChange={mockOnChange}
            disabled={true}
         />
      );

      const toggle = screen.getByRole('checkbox');
      expect(toggle).toBeDisabled();

      fireEvent.click(toggle);

      expect(mockOnChange).not.toHaveBeenCalled();
   });

   it('properly handles stopPropagation option', () => {
      const mockOnChange = jest.fn();
      const mockParentHandler = jest.fn();

      render(
         <div onClick={mockParentHandler}>
            <ToggleField
               label="Test Toggle"
               value={false}
               onChange={mockOnChange}
               stopPropagation={true}
            />
         </div>
      );

      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);

      expect(mockOnChange).toHaveBeenCalledWith(true);
   });

   it('does not stop propagation when stopPropagation is false', () => {
      const mockOnChange = jest.fn();
      const mockParentHandler = jest.fn();

      render(
         <div onClick={mockParentHandler}>
            <ToggleField
               label="Test Toggle"
               value={false}
               onChange={mockOnChange}
               stopPropagation={false}
            />
         </div>
      );

      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);

      expect(mockOnChange).toHaveBeenCalledWith(true);
      expect(mockParentHandler).toHaveBeenCalled();
   });

   it('toggles value correctly from false to true and true to false', () => {
      const cases = [
         { value: false, expected: true },
         { value: true, expected: false },
      ];
      for (const { value, expected } of cases) {
         const mockOnChange = jest.fn();
         const { unmount } = render(
            <ToggleField
               label="Test Toggle"
               value={value}
               onChange={mockOnChange}
            />
         );

         const toggle = screen.getByRole('checkbox') as HTMLInputElement;
         expect(toggle.checked).toBe(value);

         fireEvent.click(toggle);
         expect(mockOnChange).toHaveBeenCalledWith(expected);
         unmount();
      }
   });
});

describe('Toggle Styles Utility', () => {
   it('should contain all required toggle styling classes', () => {
      const requiredClasses = [
         'relative',
         'rounded-3xl',
         'peer-focus:outline-none',
         'peer-checked:after:translate-x-full',
         'after:content-[\'\']',
         'peer-checked:bg-blue-600'
      ];

      requiredClasses.forEach(className => {
         expect(TOGGLE_TRACK_CLASS_NAME).toContain(className);
      });
   });
});

describe('AddDomain', () => {
   const mockUseAddDomain = useAddDomain as unknown as jest.Mock;
   const baseDomain: DomainType = {
      ID: 1,
      domain: 'existing.com',
      slug: 'existing-com',
      notification_emails: '',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      added: '2024-01-01T00:00:00.000Z',
   };
   const mutateMock = jest.fn();
   const addDomainCloseModal = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mutateMock.mockReset();
      mockUseAddDomain.mockReturnValue({ mutate: mutateMock, isLoading: false });
   });

   const renderComponent = (domains: DomainType[] = [baseDomain]) => render(
      <AddDomain domains={domains} closeModal={addDomainCloseModal} />,
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

describe('AddTags', () => {
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
