import type { MetadataRoute } from 'next';
import { getBranding, LOGO_MIME_TYPE } from '../utils/branding';

// Read per request, so the name and logo follow the white-label settings without a rebuild.
export const dynamic = 'force-dynamic';

/** The web app manifest. With a custom logo the app icons use it, otherwise the bundled icons. */
export default function manifest(): MetadataRoute.Manifest {
   const { platformName, hasCustomLogo, logoApiPath } = getBranding();
   return {
      name: platformName,
      short_name: platformName,
      icons: hasCustomLogo
         ? [
            { src: logoApiPath, sizes: '192x192', type: LOGO_MIME_TYPE },
            { src: logoApiPath, sizes: '512x512', type: LOGO_MIME_TYPE },
         ]
         : [
            { src: '/icon.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
         ],
      theme_color: '#1d4ed8',
      background_color: '#FFFFFF',
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
   };
}
