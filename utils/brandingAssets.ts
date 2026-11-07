import { statSync } from 'fs';
import path from 'path';
import { BRANDING_FAVICON_FILE, BRANDING_LOGO_FILE, getBrandingAssets, setBrandingAssets, type BrandingAssets } from './branding';

const isFile = (filePath: string): boolean => {
   try {
      // The paths are the data folder plus one of two constant file names, never built from a request.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      return statSync(filePath).isFile();
   } catch {
      return false;
   }
};

export const getBrandingDataDir = (): string => path.join(process.cwd(), 'data');
export const getBrandingLogoPath = (): string => path.join(getBrandingDataDir(), BRANDING_LOGO_FILE);
export const getBrandingFaviconPath = (): string => path.join(getBrandingDataDir(), BRANDING_FAVICON_FILE);

/**
 * Looks for data/logo.png and data/favicon.ico once and remembers the answer until the app restarts, so no
 * request ever checks the disk. Server only (it reads the file system). Safe to call as often as needed.
 */
export const ensureBrandingAssets = (): BrandingAssets => {
   const known = getBrandingAssets();
   if (known) { return known; }
   const assets: BrandingAssets = { logo: isFile(getBrandingLogoPath()), favicon: isFile(getBrandingFaviconPath()) };
   setBrandingAssets(assets);
   return assets;
};

/** Forgets the remembered answer (tests only) */
export const resetBrandingAssets = (): void => setBrandingAssets(undefined);
