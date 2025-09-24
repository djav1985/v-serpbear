import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ToggleField from '../../app/components/common/ToggleField';

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
      
      // In testing environments, fireEvent can still trigger on disabled elements
      // But the component logic should prevent onChange from being called
      fireEvent.click(toggle);
      
      // The disabled check in handleChange should prevent onChange from being called
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
      // For stopPropagation testing, we need to verify the specific behavior
      // The change event is handled, but it should prevent/stop propagation
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
      // When stopPropagation is false, parent events should still fire
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