/**
 * Behavior tests for common layout components: Footer, PageLoader,
 * SpinnerMessage, and Branding/BrandTitle.
 */

import { render, screen } from '@testing-library/react';
import { DEFAULT_BRANDING, BrandingConfig } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

jest.mock('../../hooks/useBranding');

const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

const buildBrandingState = (branding: BrandingConfig) => ({
  branding,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: jest.fn(),
});

beforeEach(() => {
  mockUseBranding.mockReturnValue(buildBrandingState(DEFAULT_BRANDING));
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

describe('Footer component', () => {
  const footerMatcher = (platformName: string, version: string) => (
    (_: string, element?: Element | null) => element?.tagName === 'SPAN'
      && element.textContent?.replace(/\s+/g, ' ').trim() === `${platformName} v${version} by Vontainment`
  );

  it('renders the default version with a Vontainment link', async () => {
    const Footer = (await import('../../components/common/Footer')).default;
    render(<Footer currentVersion='' />);
    expect(screen.getByText(footerMatcher(DEFAULT_BRANDING.platformName, '4.0.0'))).toBeVisible();
    const link = screen.getByRole('link', { name: 'Vontainment' });
    expect(link).toHaveAttribute('href', 'https://vontainment.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders a provided version number and custom platform name', async () => {
    const customBranding: BrandingConfig = {
      ...DEFAULT_BRANDING,
      whiteLabelEnabled: true,
      platformName: 'Acme Rank',
    };
    mockUseBranding.mockReturnValue(buildBrandingState(customBranding));

    const Footer = (await import('../../components/common/Footer')).default;
    render(<Footer currentVersion='9.9.9' />);
    expect(screen.getByText(footerMatcher('Acme Rank', '9.9.9'))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// PageLoader
// ---------------------------------------------------------------------------

describe('PageLoader', () => {
  it('renders an overlay while loading', async () => {
    const PageLoader = (await import('../../components/common/PageLoader')).default;
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

  it('hides the overlay when loading finishes', async () => {
    const PageLoader = (await import('../../components/common/PageLoader')).default;
    const { container } = render(
      <PageLoader isLoading={false}>
        <div>Loaded content</div>
      </PageLoader>,
    );

    expect(screen.queryByTestId('page-loader-overlay')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
  });

  it('should not have redundant screen reader announcements', async () => {
    const PageLoader = (await import('../../components/common/PageLoader')).default;
    render(
      <PageLoader isLoading label='Loading test'>
        <div>Child content</div>
      </PageLoader>,
    );

    const overlay = screen.getByTestId('page-loader-overlay');
    expect(overlay.querySelector('.sr-only')).not.toBeInTheDocument();
    expect(overlay).toHaveAttribute('aria-label', 'Loading test');
  });
});

// ---------------------------------------------------------------------------
// SpinnerMessage
// ---------------------------------------------------------------------------

describe('SpinnerMessage', () => {
  it('renders a spinner with an accessible label', async () => {
    const SpinnerMessage = (await import('../../components/common/SpinnerMessage')).default;
    render(<SpinnerMessage label='Loading keywords' />);

    const status = screen.getByRole('status', { name: 'Loading keywords' });
    expect(status).toBeInTheDocument();
    expect(status.querySelector('svg')).not.toBeNull();
  });

  it('should not have redundant screen reader announcements', async () => {
    const SpinnerMessage = (await import('../../components/common/SpinnerMessage')).default;
    render(<SpinnerMessage label='Loading data' />);

    const status = screen.getByRole('status', { name: 'Loading data' });
    expect(status.querySelector('.sr-only')).not.toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading data');
  });

  it('uses default label when none provided', async () => {
    const SpinnerMessage = (await import('../../components/common/SpinnerMessage')).default;
    render(<SpinnerMessage />);

    const status = screen.getByRole('status', { name: 'Loading data' });
    expect(status).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branding / BrandTitle
// ---------------------------------------------------------------------------

describe('Branding components', () => {
  it('falls back to the default icon when white-label is disabled', async () => {
    const brandingModule = await import('../../components/common/Branding');
    const { BrandTitle } = brandingModule;
    const { container } = render(<BrandTitle />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the custom logo and platform name when white-label is enabled', async () => {
    const customBranding: BrandingConfig = {
      ...DEFAULT_BRANDING,
      whiteLabelEnabled: true,
      platformName: 'Acme Rankings',
      logoFile: 'brand.svg',
      logoMimeType: 'image/svg+xml',
      hasCustomLogo: true,
    };
    mockUseBranding.mockReturnValue(buildBrandingState(customBranding));

    const brandingModule = await import('../../components/common/Branding');
    const { BrandTitle } = brandingModule;
    const { getByAltText } = render(<BrandTitle />);
    const logo = getByAltText('Acme Rankings logo') as HTMLImageElement;
    expect(logo).toBeInTheDocument();
    expect(logo.src).toContain('/api/branding/logo');
  });
});
