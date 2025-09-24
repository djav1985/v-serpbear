import { render, screen } from '@testing-library/react';
import PageLoader from '../../app/components/common/PageLoader';

describe('PageLoader', () => {
   it('renders an overlay while loading', () => {
      render(
         <PageLoader isLoading label='Loading test'>
            <div>Child content</div>
         </PageLoader>,
      );

      const overlay = screen.getByTestId('page-loader-overlay');
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveClass('fixed');
      expect(screen.getByText('Child content')).toBeInTheDocument();
      expect(screen.getByRole('status', { name: 'Loading test' })).toBeInTheDocument();
   });

   it('hides the overlay when loading finishes', () => {
      const { container } = render(
         <PageLoader isLoading={false}>
            <div>Loaded content</div>
         </PageLoader>,
      );

      expect(screen.queryByTestId('page-loader-overlay')).not.toBeInTheDocument();
      expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
   });

   it('should not have redundant screen reader announcements', () => {
      render(
         <PageLoader isLoading label='Loading test'>
            <div>Child content</div>
         </PageLoader>,
      );

      const overlay = screen.getByTestId('page-loader-overlay');
      // Verify there's no sr-only span inside the overlay that would duplicate the aria-label
      expect(overlay.querySelector('.sr-only')).not.toBeInTheDocument();
      expect(overlay).toHaveAttribute('aria-label', 'Loading test');
   });
});
