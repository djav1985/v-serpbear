import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import TopBar from '../../components/common/TopBar';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

jest.mock('../../hooks/useBranding');

const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
}));

jest.mock('next/router', () => ({
   useRouter: () => ({
      pathname: '/',
      asPath: '/',
   }),
}));

describe('TopBar Component', () => {
   beforeEach(() => {
      mockUseBranding.mockReturnValue({
         branding: DEFAULT_BRANDING,
         isLoading: false,
         isError: false,
         isFetching: false,
         refetch: jest.fn(),
      });
   });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('renders without crashing', async () => {
       render(<TopBar showSettings={jest.fn} showAddModal={jest.fn} />);
       expect(
           await screen.findByText(DEFAULT_BRANDING.platformName),
       ).toBeInTheDocument();
   });

   it('aligns the back button with the topbar gutter helper', () => {
      const { container } = render(<TopBar showSettings={jest.fn} showAddModal={jest.fn} />);
      const backLink = container.querySelector('.topbar__back');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveClass('topbar__back');
   });

   it('applies the mobile edge-to-edge helper via global CSS', () => {
      const globalsPath = path.join(process.cwd(), 'styles', 'globals.css');
      const css = fs.readFileSync(globalsPath, 'utf8');

      // More robust CSS validation with better error reporting and maintainability
      // Extract the mobile media query section for targeted testing
      const mobileMediaQueryRegex = /@media\s*\(\s*max-width:\s*767px\s*\)\s*\{([\s\S]*?)\}/;
      const mobileMediaMatch = css.match(mobileMediaQueryRegex);

      expect(mobileMediaMatch).toBeTruthy();

      if (mobileMediaMatch) {
         const mobileSection = mobileMediaMatch[1];

         // Validate topbar class exists in mobile section
         expect(mobileSection).toMatch(/\.topbar\s*\{/);

         // Validate specific CSS properties with flexible whitespace handling
         expect(mobileSection).toMatch(/margin-left:\s*calc\(\s*-1\s*\*\s*var\(\s*--layout-inline\s*\)\s*\)\s*;/);
         expect(mobileSection).toMatch(/margin-right:\s*calc\(\s*-1\s*\*\s*var\(\s*--layout-inline\s*\)\s*\)\s*;/);
         expect(mobileSection).toMatch(/padding-left:\s*var\(\s*--layout-inline\s*\)\s*;/);
         expect(mobileSection).toMatch(/padding-right:\s*var\(\s*--layout-inline\s*\)\s*;/);
         expect(mobileSection).toMatch(
            /width:\s*calc\(\s*100%\s*\+\s*\(\s*var\(\s*--layout-inline\s*\)\s*\*\s*2\s*\)\s*\)\s*;/,
         );
      }

      // Ensure no body overrides in mobile media queries (maintains body gutters)
      const mobileBodyOverride = /@media\s*\(\s*max-width:\s*767px\s*\)\s*\{[^}]*body\s*\{/;
      expect(css).not.toMatch(mobileBodyOverride);
   });

   it('applies the shared desktop container utility', () => {
      const { container } = render(<TopBar showSettings={jest.fn} showAddModal={jest.fn} />);
      const topbarElement = container.querySelector('.topbar');

      expect(topbarElement).toBeInTheDocument();
      expect(topbarElement?.classList.contains('desktop-container')).toBe(true);
      expect(topbarElement?.className).not.toMatch(/max-w-\dxl?/);
   });
});
