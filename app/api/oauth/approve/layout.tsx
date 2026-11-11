import type { ReactNode } from 'react';
import { PageTransition } from 'app/_components/page-transition';

export default function OAuthApprovalLayout({ children }: { children: ReactNode }) {
   return <PageTransition>{children}</PageTransition>;
}
