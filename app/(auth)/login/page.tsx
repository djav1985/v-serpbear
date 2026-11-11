import type { Metadata } from 'next';
import { getBranding } from 'utils/branding';
import { LoginForm } from './_components/login-form';

export const metadata: Metadata = { title: 'Login' };

type LoginPageProps = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
   const branding = getBranding();
   const { next = '' } = await searchParams;
   const returnTo = /^\/oauth\/approve\?request=[A-Za-z0-9_-]{43}$/.test(next) ? next : '/';

   return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
         <LoginForm branding={branding} returnTo={returnTo} />
      </main>
   );
}
