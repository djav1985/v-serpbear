/* eslint-disable security/detect-non-literal-fs-filename -- writes only to a temp directory created by the test */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { buildLogoUrl, getBranding, setBrandingAssets } from '../../utils/branding';
import { ensureBrandingAssets, resetBrandingAssets } from '../../utils/brandingAssets';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_CWD = process.cwd();

describe('branding utils', () => {
   afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
      setBrandingAssets(undefined);
   });

   describe('getBranding', () => {
      it('reports each white-label file on its own, and only while white label is on', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true', NEXT_PUBLIC_PLATFORM_NAME: 'Acme SEO' };

         setBrandingAssets({ logo: true, favicon: false });
         expect(getBranding()).toMatchObject({ whiteLabelEnabled: true, platformName: 'Acme SEO', hasCustomLogo: true, hasCustomFavicon: false });

         setBrandingAssets({ logo: false, favicon: true });
         expect(getBranding()).toMatchObject({ hasCustomLogo: false, hasCustomFavicon: true });

         process.env.NEXT_PUBLIC_WHITE_LABEL = 'false';
         expect(getBranding()).toMatchObject({ platformName: 'SerpBear', hasCustomLogo: false, hasCustomFavicon: false });
      });

      it('has no custom files until the server has looked for them', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };

         expect(getBranding()).toMatchObject({ hasCustomLogo: false, hasCustomFavicon: false });
      });

      it('uses the fixed logo and icon addresses', () => {
         expect(getBranding()).toMatchObject({ logoApiPath: '/api/branding/logo.png', faviconApiPath: '/api/branding/favicon.ico' });
      });
   });

   describe('buildLogoUrl', () => {
      it('returns empty string when white-label is disabled', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'false' };
         setBrandingAssets({ logo: true, favicon: true });

         expect(buildLogoUrl('https://example.com')).toBe('');
      });

      it('returns empty string when white-label is on but logo.png is missing', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
         setBrandingAssets({ logo: false, favicon: true });

         expect(buildLogoUrl('https://example.com')).toBe('');
      });

      it('builds the logo URL when white-label is on and logo.png exists', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
         setBrandingAssets({ logo: true, favicon: false });

         expect(buildLogoUrl('https://example.com')).toBe('https://example.com/api/branding/logo.png');
      });

      it('strips trailing slashes from the origin', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
         setBrandingAssets({ logo: true, favicon: false });

         expect(buildLogoUrl('https://example.com/')).toBe('https://example.com/api/branding/logo.png');
      });

      it('returns a relative path with an empty origin', () => {
         process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_WHITE_LABEL: 'true' };
         setBrandingAssets({ logo: true, favicon: false });

         expect(buildLogoUrl('')).toBe('/api/branding/logo.png');
      });
   });

   describe('ensureBrandingAssets', () => {
      let workDir: string;

      beforeEach(() => {
         workDir = mkdtempSync(path.join(os.tmpdir(), 'serpbear-branding-'));
         mkdirSync(path.join(workDir, 'data'));
         process.chdir(workDir);
         resetBrandingAssets();
      });

      afterEach(() => {
         process.chdir(ORIGINAL_CWD);
         resetBrandingAssets();
         rmSync(workDir, { recursive: true, force: true });
      });

      it('finds logo.png and favicon.ico by those exact names', () => {
         writeFileSync(path.join(workDir, 'data', 'logo.png'), 'png');
         writeFileSync(path.join(workDir, 'data', 'favicon.ico'), 'ico');

         expect(ensureBrandingAssets()).toEqual({ logo: true, favicon: true });
      });

      it('treats each file on its own, and ignores other file names', () => {
         writeFileSync(path.join(workDir, 'data', 'logo.png'), 'png');
         writeFileSync(path.join(workDir, 'data', 'branding-logo.png'), 'png');
         expect(ensureBrandingAssets()).toEqual({ logo: true, favicon: false });

         resetBrandingAssets();
         rmSync(path.join(workDir, 'data', 'logo.png'));
         writeFileSync(path.join(workDir, 'data', 'favicon.ico'), 'ico');
         expect(ensureBrandingAssets()).toEqual({ logo: false, favicon: true });
      });

      it('remembers the answer until the app restarts', () => {
         expect(ensureBrandingAssets()).toEqual({ logo: false, favicon: false });

         writeFileSync(path.join(workDir, 'data', 'logo.png'), 'png');
         expect(ensureBrandingAssets()).toEqual({ logo: false, favicon: false });

         resetBrandingAssets();
         expect(ensureBrandingAssets()).toEqual({ logo: true, favicon: false });
      });
   });
});
