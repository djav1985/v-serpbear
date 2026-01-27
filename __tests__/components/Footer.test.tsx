import { render, screen } from '@testing-library/react';
import Footer from '../../components/common/Footer';
import { DEFAULT_BRANDING, BrandingConfig } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

jest.mock('../../hooks/useBranding');

const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

const buildState = (branding: BrandingConfig) => ({
   branding,
   isLoading: false,
   isError: false,
   isFetching: false,
   refetch: jest.fn(),
});

describe('Footer component', () => {
   beforeEach(() => {
      mockUseBranding.mockReturnValue(buildState(DEFAULT_BRANDING));
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   const footerMatcher = (platformName: string, version: string) => (
      (_: string, element?: Element | null) => element?.tagName === 'SPAN'
         && element.textContent?.replace(/\s+/g, ' ').trim() === `${platformName} v${version} by Vontainment`
   );

   it('renders the default version with a Vontainment link', () => {
      render(<Footer currentVersion='' />);
      expect(screen.getByText(footerMatcher(DEFAULT_BRANDING.platformName, '4.0.0'))).toBeVisible();
      const link = screen.getByRole('link', { name: 'Vontainment' });
      expect(link).toHaveAttribute('href', 'https://vontainment.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
   });

   it('renders a provided version number and custom platform name', () => {
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         whiteLabelEnabled: true,
         platformName: 'Acme Rank',
      };
      mockUseBranding.mockReturnValue(buildState(customBranding));

      render(<Footer currentVersion='9.9.9' />);
      expect(screen.getByText(footerMatcher('Acme Rank', '9.9.9'))).toBeVisible();
   });
});
