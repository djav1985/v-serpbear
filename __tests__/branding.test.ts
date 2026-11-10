import { LOGO_FILE, LOGO_MIME_TYPE, buildLogoUrl, getBranding } from '../utils/branding';

describe('branding', () => {
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

           expect(buildLogoUrl('https://example.com')).toBe('https://example.com/api/images/logo.png');
        });

        it('strips trailing slashes from origin', () => {
           process.env = {
              ...ORIGINAL_ENV,
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com'
           };

           const logoUrl = buildLogoUrl('https://example.com/');
           expect(logoUrl).toBe('https://example.com/api/images/logo.png');
        });

        it('works with empty origin parameter', () => {
           process.env = {
              ...ORIGINAL_ENV,
              NEXT_PUBLIC_WHITE_LABEL: 'true',
              NEXT_PUBLIC_APP_URL: 'https://example.com'
           };

           const logoUrl = buildLogoUrl('');
           expect(logoUrl).toBe('/api/images/logo.png');
        });
     });

  });
});
