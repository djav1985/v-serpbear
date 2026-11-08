'use client';

import { ViewTransition, type ReactNode } from 'react';

/**
 * Cross-fades the page when the route changes. Next.js runs navigations as transitions, so the content swaps inside
 * a view transition. Motion is turned off for users who prefer reduced motion (see globals.css).
 */
export function PageTransition({ children }: { children: ReactNode }) {
   return <ViewTransition>{children}</ViewTransition>;
}
