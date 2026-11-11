import type { ReactNode } from 'react';
import { PageTransition } from '../_components/page-transition';

export default function AuthLayout({ children }: { children: ReactNode }) {
   return <PageTransition>{children}</PageTransition>;
}
