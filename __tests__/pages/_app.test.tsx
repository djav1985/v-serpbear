import { render } from '@testing-library/react';
import type { AppContext } from 'next/app';
import MyApp from '../../pages/_app';
import { getBranding, DEFAULT_BRANDING, BrandingConfig } from '../../utils/branding';

jest.mock('../../utils/branding', () => ({
   ...jest.requireActual('../../utils/branding'),
   getBranding: jest.fn(),
}));

const mockGetBranding = getBranding as jest.MockedFunction<typeof getBranding>;

describe('_app.tsx server-side branding', () => {
   beforeEach(() => {
      mockGetBranding.mockReturnValue(DEFAULT_BRANDING);
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('provides default branding via getInitialProps', async () => {
      const mockContext = {
         Component: () => <div>Test Page</div>,
         ctx: {} as any,
         router: {} as any,
      } as unknown as AppContext;

      const result = await MyApp.getInitialProps!(mockContext);

      expect(mockGetBranding).toHaveBeenCalled();
      expect(result.pageProps).toBeDefined();
      expect(result.pageProps.serverSideBranding).toEqual(DEFAULT_BRANDING);
   });

   it('provides custom white-label branding via getInitialProps', async () => {
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         whiteLabelEnabled: true,
         platformName: 'Acme SEO',
         logoFile: 'custom-logo.svg',
         hasCustomLogo: true,
         logoMimeType: 'image/svg+xml',
      };

      mockGetBranding.mockReturnValue(customBranding);

      const mockContext = {
         Component: () => <div>Test Page</div>,
         ctx: {} as any,
         router: {} as any,
      } as unknown as AppContext;

      const result = await MyApp.getInitialProps!(mockContext);

      expect(result.pageProps.serverSideBranding).toEqual(customBranding);
      expect(result.pageProps.serverSideBranding.platformName).toBe('Acme SEO');
      expect(result.pageProps.serverSideBranding.whiteLabelEnabled).toBe(true);
   });

   it('renders without crashing with server-side branding', () => {
      const TestComponent = () => <div>Test Content</div>;
      
      const { container } = render(
         <MyApp
            Component={TestComponent}
            pageProps={{ serverSideBranding: DEFAULT_BRANDING }}
            router={{} as any}
         />,
      );

      expect(container.textContent).toContain('Test Content');
   });

   it('renders with custom branding in pageProps', () => {
      const customBranding: BrandingConfig = {
         ...DEFAULT_BRANDING,
         platformName: 'Custom Platform',
         whiteLabelEnabled: true,
      };

      const TestComponent = () => <div>Test Content</div>;
      
      const { container } = render(
         <MyApp
            Component={TestComponent}
            pageProps={{ serverSideBranding: customBranding }}
            router={{} as any}
         />,
      );

      expect(container.textContent).toContain('Test Content');
   });
});
