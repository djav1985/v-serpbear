'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Brand } from 'app/_components/brand';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { cn } from 'lib/utils';
import type { BrandingConfig } from 'utils/branding';
import { apiPost, ApiError } from 'utils/client/apiClient';

type LoginError = { type: string; msg: string };

const ERROR_VISIBLE_MS = 3000;

export function LoginForm({ branding }: { branding: BrandingConfig }) {
   const router = useRouter();
   const queryClient = useQueryClient();
   const [error, setError] = useState<LoginError | null>(null);
   const [username, setUsername] = useState('');
   const [password, setPassword] = useState('');
   const [isSubmitting, setIsSubmitting] = useState(false);
   const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

   // Clearing the previous timer keeps an older timeout from hiding a newer error early.
   const showError = (loginError: LoginError) => {
      if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); }
      setError(loginError);
      errorTimerRef.current = setTimeout(() => { setError(null); errorTimerRef.current = null; }, ERROR_VISIBLE_MS);
   };
   useEffect(() => () => { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } }, []);

   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) { return; }

      if (!username || !password) {
         if (!username && !password) {
            showError({ type: 'empty_username_password', msg: 'Please insert your app username & password to log in.' });
         } else if (!username) {
            showError({ type: 'empty_username', msg: 'Please insert your app username.' });
         } else {
            showError({ type: 'empty_password', msg: 'Please insert your app password.' });
         }
         return;
      }

      setIsSubmitting(true);
      try {
         await apiPost<{ success: boolean }>('/api/login', { username, password });
         // Drop cached auth state from before login so the next protected page does not bounce back here.
         queryClient.clear();
         router.push('/');
         router.refresh();
      } catch (err) {
         // The backend returns a generic 'Invalid credentials' message on purpose (no username enumeration).
         const msg = err instanceof ApiError ? err.message : 'Network error: unable to connect to the server.';
         showError({ type: '', msg });
         setIsSubmitting(false);
      }
   };

   const usernameInvalid = !!error && error.type.includes('username');
   const passwordInvalid = !!error && error.type.includes('password');

   return (
      <div className="w-full max-w-sm">
         <h1 className="text-primary mb-6 text-center text-2xl font-semibold">
            <Brand branding={branding} markSize={30} />
         </h1>
         <Card>
            <CardHeader>
               <CardTitle className="text-base">Sign in</CardTitle>
            </CardHeader>
            <CardContent>
               <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                  <div className="flex flex-col gap-2">
                     <Label htmlFor="login-username">Username</Label>
                     <Input
                        id="login-username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        aria-invalid={usernameInvalid}
                        onChange={(event) => setUsername(event.target.value)}
                     />
                  </div>
                  <div className="flex flex-col gap-2">
                     <Label htmlFor="login-password">Password</Label>
                     <Input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        aria-invalid={passwordInvalid}
                        onChange={(event) => setPassword(event.target.value)}
                     />
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                     {isSubmitting ? 'Logging in…' : 'Login'}
                  </Button>
                  <p
                     role="alert"
                     className={cn('text-destructive min-h-5 text-center text-sm font-medium', !error?.msg && 'invisible')}
                  >
                     {error?.msg ?? ''}
                  </p>
               </form>
            </CardContent>
         </Card>
      </div>
   );
}
