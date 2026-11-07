import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getBranding, LOGO_MIME_TYPE } from '../utils/branding';
import { Providers } from './_components/providers';
import './globals.css';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
   const { platformName, hasCustomLogo, logoApiPath } = getBranding();
   const icon = hasCustomLogo
      ? { url: logoApiPath, type: LOGO_MIME_TYPE }
      : { url: '/favicon.ico' };

   return {
      title: { default: platformName, template: `%s - ${platformName}` },
      icons: { icon: [icon], apple: hasCustomLogo ? { url: logoApiPath, type: LOGO_MIME_TYPE } : '/icon.png' },
   };
}

export const viewport: Viewport = {
   width: 'device-width',
   initialScale: 1,
   themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
   return (
      <html lang="en">
         <body>
            <Providers>{children}</Providers>
         </body>
      </html>
   );
}
