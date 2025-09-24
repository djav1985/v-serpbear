import { render, screen } from '@testing-library/react';
import SpinnerMessage from '../../app/components/common/SpinnerMessage';

describe('SpinnerMessage', () => {
   it('renders a spinner with an accessible label', () => {
      render(<SpinnerMessage label='Loading keywords' />);

      const status = screen.getByRole('status', { name: 'Loading keywords' });
      expect(status).toBeInTheDocument();
      expect(status.querySelector('svg')).not.toBeNull();
   });

   it('should not have redundant screen reader announcements', () => {
      render(<SpinnerMessage label='Loading data' />);

      const status = screen.getByRole('status', { name: 'Loading data' });
      // Verify there's no sr-only span inside that would duplicate the aria-label
      expect(status.querySelector('.sr-only')).not.toBeInTheDocument();
      expect(status).toHaveAttribute('aria-label', 'Loading data');
   });

   it('uses default label when none provided', () => {
      render(<SpinnerMessage />);

      const status = screen.getByRole('status', { name: 'Loading data' });
      expect(status).toBeInTheDocument();
   });
});
