import { buildLogoUrl, getBranding, LOGO_FILE, LOGO_MIME_TYPE } from '../../utils/branding';

const ORIGINAL_ENV = { ...process.env };

describe('branding utils', () => {
   afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
      jest.resetModules();
   });

   describe('fixed logo file', () => {
      it('always uses logo.png as a PNG, whatever the environment says', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true', WHITE_LABEL_LOGO_FILE: 'something-else.svg' };

         expect(LOGO_FILE).toBe('logo.png');
         expect(LOGO_MIME_TYPE).toBe('image/png');
         expect(getBranding().hasCustomLogo).toBe(true);
         expect(getBranding()).not.toHaveProperty('logoFile');
      });

      it('has no custom logo when white-label is off', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'false' };

         expect(getBranding().hasCustomLogo).toBe(false);
      });
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

      it('returns the logo URL whenever white-label is enabled (the logo is always data/logo.png)', () => {
         process.env = {
            ...ORIGINAL_ENV,
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            NEXT_PUBLIC_APP_URL: 'https://example.com'
         };

         expect(buildLogoUrl('https://example.com')).toBe('https://example.com/api/branding/logo');
      });

      it('builds correct URL when white-label is enabled with valid logo file', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('https://example.com/api/branding/logo');
      });

      it('strips trailing slashes from origin', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com/');
         expect(logoUrl).toBe('https://example.com/api/branding/logo');
      });

      it('works with empty origin parameter', () => {
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
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
            NEXT_PUBLIC_APP_URL: 'https://example.com' 
         };
         
         const logoUrl = buildLogoUrl('https://example.com');
         expect(logoUrl).toBe('');
         
         // Test that buildLogoUrl returns proper URL when conditions are met
         process.env = { 
            ...ORIGINAL_ENV, 
            NEXT_PUBLIC_WHITE_LABEL: 'true',
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