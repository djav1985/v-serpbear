import { normalizeToBoolean } from './dbBooleans';
import { trimString } from './security';

export type BrandingConfig = {
   defaultPlatformName: string;
   whiteLabelEnabled: boolean;
   platformName: string;
   hasCustomLogo: boolean;
   hasCustomFavicon: boolean;
   logoApiPath: string;
   faviconApiPath: string;
};

export const DEFAULT_PLATFORM_NAME = 'SerpBear';

/** The two white-label files, looked for by these exact names in the data folder */
export const BRANDING_LOGO_FILE = 'logo.png';
export const BRANDING_FAVICON_FILE = 'favicon.ico';

const LOGO_API_PATH = `/api/branding/${BRANDING_LOGO_FILE}`;
const FAVICON_API_PATH = `/api/branding/${BRANDING_FAVICON_FILE}`;

const stripTrailingSlash = (value: string): string => (value.endsWith('/') ? value.slice(0, -1) : value);

export const DEFAULT_BRANDING: BrandingConfig = {
   defaultPlatformName: DEFAULT_PLATFORM_NAME,
   whiteLabelEnabled: false,
   platformName: DEFAULT_PLATFORM_NAME,
   hasCustomLogo: false,
   hasCustomFavicon: false,
   logoApiPath: LOGO_API_PATH,
   faviconApiPath: FAVICON_API_PATH,
};

/**
 * Which of the two white-label files exist in the data folder. The server checks the folder once (see
 * utils/brandingAssets.ts) and keeps the result here until the app restarts. It lives on globalThis because the
 * instrumentation hook, the API routes and the pages are separate bundles. In the browser it is never set, so the
 * browser learns about the files from /api/branding/config instead.
 */
export type BrandingAssets = { logo: boolean; favicon: boolean };
const BRANDING_ASSETS_KEY = '__serpbearBrandingAssets';

export const setBrandingAssets = (assets: BrandingAssets | undefined): void => {
   (globalThis as Record<string, unknown>)[BRANDING_ASSETS_KEY] = assets;
};

export const getBrandingAssets = (): BrandingAssets | undefined => (
   (globalThis as Record<string, unknown>)[BRANDING_ASSETS_KEY] as BrandingAssets | undefined
);

export const getBranding = (): BrandingConfig => {
   const whiteLabelEnabled = normalizeToBoolean(process.env.NEXT_PUBLIC_WHITE_LABEL);
   const platformNameSetting = trimString(process.env.NEXT_PUBLIC_PLATFORM_NAME);
   const assets = getBrandingAssets();

   const platformName = whiteLabelEnabled && platformNameSetting
      ? platformNameSetting
      : DEFAULT_PLATFORM_NAME;

   return {
      defaultPlatformName: DEFAULT_PLATFORM_NAME,
      whiteLabelEnabled,
      platformName,
      // Each file falls back to the default on its own when it is missing
      hasCustomLogo: whiteLabelEnabled && !!assets?.logo,
      hasCustomFavicon: whiteLabelEnabled && !!assets?.favicon,
      logoApiPath: LOGO_API_PATH,
      faviconApiPath: FAVICON_API_PATH,
   } as const;
};

type BuildLogoUrlFirstArg = BrandingConfig | string | undefined;

export const buildLogoUrl = (brandingOrOrigin?: BuildLogoUrlFirstArg): string => {
   const branding = typeof brandingOrOrigin === 'string' || brandingOrOrigin === undefined
      ? getBranding()
      : brandingOrOrigin;

   const origin = typeof brandingOrOrigin === 'string' ? brandingOrOrigin : '';

   if (!branding.hasCustomLogo) {
      return '';
   }

   const sanitizedOrigin = origin ? stripTrailingSlash(origin) : '';
   return `${sanitizedOrigin}${branding.logoApiPath}`;
};

