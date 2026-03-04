import { render, fireEvent, screen } from '@testing-library/react';
import Icon from '../../components/common/Icon';
import Modal from '../../components/common/Modal';
import ToggleField from '../../components/common/ToggleField';
import { TOGGLE_TRACK_CLASS_NAME } from '../../components/common/toggleStyles';

describe('Icon Component', () => {
   it('renders without crashing', async () => {
       render(<Icon type='logo' size={24} />);
       expect(document.querySelector('svg')).toBeInTheDocument();
   });

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
   it('Renders without crashing', async () => {
       render(<Modal closeModal={closeModalMock }><div></div></Modal>);
       expect(document.querySelector('.modal')).toBeInTheDocument();
   });
   it('Displays the Given Content', async () => {
      render(<Modal closeModal={closeModalMock}>
        <div>
           <h1>Hello Modal!!</h1>
        </div>
      </Modal>);
      expect(await screen.findByText('Hello Modal!!')).toBeInTheDocument();
   });
   it('Renders Modal Title', async () => {
      render(<Modal closeModal={closeModalMock} title="Sample Modal Title"><p>Some Modal Content</p></Modal>);
      expect(await screen.findByText('Sample Modal Title')).toBeInTheDocument();
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
   it('renders without crashing', () => {
      const mockOnChange = jest.fn();
      render(
         <ToggleField
            label="Test Toggle"
            value={false}
            onChange={mockOnChange}
         />
      );
      expect(screen.getByText('Test Toggle')).toBeInTheDocument();
   });

   it('calls onChange when toggle is clicked', () => {
      const mockOnChange = jest.fn();
      render(
         <ToggleField
            label="Test Toggle"
            value={false}
            onChange={mockOnChange}
         />
      );

      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);

      expect(mockOnChange).toHaveBeenCalledWith(true);
   });

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

   it('toggles value correctly from false to true', () => {
      const mockOnChange = jest.fn();
      render(
         <ToggleField
            label="Test Toggle"
            value={false}
            onChange={mockOnChange}
         />
      );

      const toggle = screen.getByRole('checkbox');
      expect(toggle).not.toBeChecked();

      fireEvent.click(toggle);
      expect(mockOnChange).toHaveBeenCalledWith(true);
   });

   it('toggles value correctly from true to false', () => {
      const mockOnChange = jest.fn();
      render(
         <ToggleField
            label="Test Toggle"
            value={true}
            onChange={mockOnChange}
         />
      );

      const toggle = screen.getByRole('checkbox');
      expect(toggle).toBeChecked();

      fireEvent.click(toggle);
      expect(mockOnChange).toHaveBeenCalledWith(false);
   });
});

describe('Toggle Styles Utility', () => {
   it('should export a valid CSS class string', () => {
      expect(TOGGLE_TRACK_CLASS_NAME).toBeDefined();
      expect(typeof TOGGLE_TRACK_CLASS_NAME).toBe('string');
      expect(TOGGLE_TRACK_CLASS_NAME.length).toBeGreaterThan(0);
   });

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

   it('should be a space-separated string of CSS classes', () => {
      const classes = TOGGLE_TRACK_CLASS_NAME.split(' ');
      expect(classes.length).toBeGreaterThan(5);

      classes.forEach(className => {
         expect(className.trim()).toBeTruthy();
      });
   });
});
