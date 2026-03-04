import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import Sidebar from '../../components/common/Sidebar';
import TopBar from '../../components/common/TopBar';
import { dummyDomain } from '../../__mocks__/data';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';

const addDomainMock = jest.fn();

jest.mock('../../hooks/useBranding');

jest.mock('../../utils/client/origin', () => ({
   getClientOrigin: () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
}));

jest.mock('next/router', () => ({
   useRouter: () => ({
      pathname: '/',
      asPath: '/',
   }),
}));

const mockUseBranding = useBranding as jest.MockedFunction<typeof useBranding>;

const createTestQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderTopBar = () => {
   const queryClient = createTestQueryClient();
   return render(
      <QueryClientProvider client={queryClient}>
         <TopBar showSettings={jest.fn} showAddModal={jest.fn} />
      </QueryClientProvider>,
   );
};

describe('Sidebar Component', () => {
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
       render(<Sidebar domains={[dummyDomain]} showAddModal={addDomainMock} />);
       expect(screen.getByText(DEFAULT_BRANDING.platformName)).toBeInTheDocument();
   });
   it('renders domain list', async () => {
      render(<Sidebar domains={[dummyDomain]} showAddModal={addDomainMock} />);
      expect(screen.getByText('compressimage.io')).toBeInTheDocument();
   });
   it('calls showAddModal on Add Domain button click', async () => {
      render(<Sidebar domains={[dummyDomain]} showAddModal={addDomainMock} />);
      const addDomainBtn = screen.getByTestId('add_domain');
      fireEvent.click(addDomainBtn);
      expect(addDomainMock).toHaveBeenCalledWith(true);
   });
});

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
       renderTopBar();
       expect(
           await screen.findByText(DEFAULT_BRANDING.platformName),
       ).toBeInTheDocument();
   });

   it('aligns the back button with the topbar gutter helper', () => {
      const { container } = renderTopBar();
      const backLink = container.querySelector('.topbar__back');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveClass('topbar__back');
   });

   it('applies the mobile edge-to-edge helper via global CSS', () => {
      const globalsPath = path.join(process.cwd(), 'styles', 'globals.css');
      const css = fs.readFileSync(globalsPath, 'utf8');

      const mobileMediaQueryRegex = /@media\s*\(\s*max-width:\s*767px\s*\)\s*\{([\s\S]*?)\}/;
      const mobileMediaMatch = css.match(mobileMediaQueryRegex);

      expect(mobileMediaMatch).toBeTruthy();

      if (mobileMediaMatch) {
         const mobileSection = mobileMediaMatch[1];

         expect(mobileSection).toMatch(/\.topbar\s*\{/);

         expect(mobileSection).toMatch(/margin-left:\s*calc\(\s*-1\s*\*\s*var\(\s*--layout-inline\s*\)\s*\)\s*;/);
         expect(mobileSection).toMatch(/margin-right:\s*calc\(\s*-1\s*\*\s*var\(\s*--layout-inline\s*\)\s*\)\s*;/);
         expect(mobileSection).toMatch(/padding-left:\s*var\(\s*--layout-inline\s*\)\s*;/);
         expect(mobileSection).toMatch(/padding-right:\s*var\(\s*--layout-inline\s*\)\s*;/);
         expect(mobileSection).toMatch(
            /width:\s*calc\(\s*100%\s*\+\s*\(\s*var\(\s*--layout-inline\s*\)\s*\*\s*2\s*\)\s*\)\s*;/,
         );
      }

      const mobileBodyOverride = /@media\s*\(\s*max-width:\s*767px\s*\)\s*\{[^}]*body\s*\{/;
      expect(css).not.toMatch(mobileBodyOverride);
   });

   it('applies the shared desktop container utility', () => {
      const { container } = renderTopBar();
      const topbarElement = container.querySelector('.topbar');

      expect(topbarElement).toBeInTheDocument();
      expect(topbarElement?.classList.contains('desktop-container')).toBe(true);
      expect(topbarElement?.className).not.toMatch(/max-w-\dxl?/);
   });
});
