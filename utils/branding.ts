import { normalizeToBoolean } from './dbBooleans';
import { trimString } from './security';

export type BrandingConfig = {
   defaultPlatformName: string;
   whiteLabelEnabled: boolean;
   platformName: string;
   hasCustomLogo: boolean;
   logoApiPath: string;
   faviconApiPath: string;
};

export const DEFAULT_PLATFORM_NAME = 'SerpBear';
/** The white-label logo is always this file in the data directory. There is no setting for it. */
export const LOGO_FILE = 'logo.png';
/** The white-label tab icon is always this file in the data directory. */
export const FAVICON_FILE = 'favicon.png';
export const LOGO_MIME_TYPE = 'image/png';

const stripTrailingSlash = (value: string): string => (value.endsWith('/') ? value.slice(0, -1) : value);

export const getBranding = (): BrandingConfig => {
   const whiteLabelEnabled = normalizeToBoolean(process.env.NEXT_PUBLIC_WHITE_LABEL);
   const platformNameSetting = trimString(process.env.NEXT_PUBLIC_PLATFORM_NAME);

   const platformName = whiteLabelEnabled && platformNameSetting
      ? platformNameSetting
      : DEFAULT_PLATFORM_NAME;

   return {
      defaultPlatformName: DEFAULT_PLATFORM_NAME,
      whiteLabelEnabled,
      platformName,
      hasCustomLogo: whiteLabelEnabled,
      logoApiPath: '/api/images/logo.png',
      faviconApiPath: '/api/images/favicon.png',
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

