import type { Metadata } from 'next';
import { getBranding } from 'utils/branding';
import { LoginForm } from './_components/login-form';

export const metadata: Metadata = { title: 'Login' };

export default function LoginPage() {
   const branding = getBranding();

   return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
         <LoginForm branding={branding} />
      </main>
   );
}
