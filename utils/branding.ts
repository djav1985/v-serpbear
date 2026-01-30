export type BrandingConfig = {
   defaultPlatformName: string;
   whiteLabelEnabled: boolean;
   platformName: string;
   logoFile: string;
   hasCustomLogo: boolean;
   logoMimeType: string;
   logoApiPath: string;
};

export const DEFAULT_PLATFORM_NAME = 'SerpBear';
const DEFAULT_LOGO_FILE = 'branding-logo.png';

const LOGO_MIME_TYPES: Record<string, string> = {
   '.png': 'image/png',
   '.jpg': 'image/jpeg',
   '.jpeg': 'image/jpeg',
   '.gif': 'image/gif',
   '.svg': 'image/svg+xml',
   '.webp': 'image/webp',
};

const normalizeBoolean = (value?: string): boolean => (value || '').toLowerCase() === 'true';

const trimString = (value?: string | null): string => (value || '').trim();

const stripTrailingSlash = (value: string): string => (value.endsWith('/') ? value.slice(0, -1) : value);

export const DEFAULT_BRANDING: BrandingConfig = {
   defaultPlatformName: DEFAULT_PLATFORM_NAME,
   whiteLabelEnabled: false,
   platformName: DEFAULT_PLATFORM_NAME,
   logoFile: DEFAULT_LOGO_FILE,
   hasCustomLogo: false,
   logoMimeType: '',
   logoApiPath: '/api/branding/logo',
};

export const getLogoMimeType = (fileName: string): string => {
   const lastDot = fileName.lastIndexOf('.');
   if (lastDot === -1) {
      return '';
   }

   const extension = fileName.slice(lastDot).toLowerCase();
   return LOGO_MIME_TYPES[extension] || '';
};

export const getBranding = (): BrandingConfig => {
   const whiteLabelEnabled = normalizeBoolean(process.env.NEXT_PUBLIC_WHITE_LABEL);
   const platformNameSetting = trimString(process.env.NEXT_PUBLIC_PLATFORM_NAME);
   const logoFileSetting = trimString(process.env.WHITE_LABEL_LOGO_FILE || DEFAULT_LOGO_FILE);
   const logoMimeType = getLogoMimeType(logoFileSetting);
   const hasCustomLogo = whiteLabelEnabled && !!logoMimeType && !!logoFileSetting;

   const platformName = whiteLabelEnabled && platformNameSetting
      ? platformNameSetting
      : DEFAULT_PLATFORM_NAME;

   return {
      defaultPlatformName: DEFAULT_PLATFORM_NAME,
      whiteLabelEnabled,
      platformName,
      logoFile: logoFileSetting,
      hasCustomLogo,
      logoMimeType,
      logoApiPath: '/api/branding/logo',
   } as const;
};

type BuildLogoUrlFirstArg = BrandingConfig | string | undefined;

export const buildLogoUrl = (brandingOrOrigin?: BuildLogoUrlFirstArg, originOverride = ''): string => {
   const branding = typeof brandingOrOrigin === 'string' || brandingOrOrigin === undefined
      ? getBranding()
      : brandingOrOrigin;

   const origin = typeof brandingOrOrigin === 'string' || brandingOrOrigin === undefined
      ? (brandingOrOrigin || '')
      : originOverride;

   if (!branding.hasCustomLogo) {
      return '';
   }

   const sanitizedOrigin = origin ? stripTrailingSlash(origin) : '';
   return `${sanitizedOrigin}${branding.logoApiPath}`;
};

