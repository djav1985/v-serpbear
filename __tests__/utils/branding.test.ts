import { buildLogoUrl } from '../../utils/branding';

const ORIGINAL_ENV = { ...process.env };

describe('branding utils', () => {
   afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
      jest.resetModules();
   });

   describe('buildLogoUrl', () => {
      it('returns empty string when white-label is disabled', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'false',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('');
      });

      it('returns logo URL even when logo file is empty (uses default branding-logo.png)', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: '',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         // When WHITE_LABEL_LOGO_FILE is empty, it defaults to 'branding-logo.png'
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('https://example.com/api/branding/logo');
      });

      it('returns empty string when logo file has no valid extension', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: 'logo-no-extension',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('');
      });

      it('builds correct URL when white-label is enabled with valid logo file', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: 'custom-logo.png',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('https://example.com/api/branding/logo');
      });

      it('strips trailing slashes from origin', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: 'custom-logo.png',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com/');
         expect(logoUrl).toBe('https://example.com/api/branding/logo');
      });

      it('works with empty origin parameter', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: 'custom-logo.png',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('');
         expect(logoUrl).toBe('/api/branding/logo');
      });
   });

   describe('email branding integration', () => {
      it('buildLogoUrl handles all logo validation internally', () => {
         // Test that buildLogoUrl returns empty string when conditions aren't met
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'false',
            WHITE_LABEL_LOGO_FILE: 'logo.png',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('');
         
         // Test that buildLogoUrl returns proper URL when conditions are met
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: 'logo.png',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const validLogoUrl = buildLogoUrl('https://example.com');
         expect(validLogoUrl).toBe('https://example.com/api/branding/logo');
      });

      it('buildLogoUrl can be used directly without additional conditional checks', () => {
         const DEFAULT_BRAND_LOGO = 'https://serpbear.b-cdn.net/ikAdjQq.png';
         
         // Test with white-label disabled - buildLogoUrl returns empty string
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'false',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
         const logoUrl = buildLogoUrl(baseUrl);
         const emailLogo = logoUrl || DEFAULT_BRAND_LOGO;
         
         expect(logoUrl).toBe('');
         expect(emailLogo).toBe(DEFAULT_BRAND_LOGO);
         
         // Test with white-label enabled - buildLogoUrl returns proper URL
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            WHITE_LABEL_LOGO_FILE: 'logo.svg',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const baseUrl2 = process.env.NEXT_PUBLIC_APP_URL || '';
         const logoUrl2 = buildLogoUrl(baseUrl2);
         const emailLogo2 = logoUrl2 || DEFAULT_BRAND_LOGO;
         
         expect(logoUrl2).toBe('https://example.com/api/branding/logo');
         expect(emailLogo2).toBe('https://example.com/api/branding/logo');
      });
   });
});