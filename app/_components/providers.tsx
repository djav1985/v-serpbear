'use client';

import { useState, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from 'components/ui/tooltip';
import { ApiError } from 'utils/client/apiClient';

// Server seeds and browser queries share one set of defaults so hydrated data is not refetched on mount.
const STALE_TIME_MS = 30_000;

// An expired or revoked session answers 401 from the API. Send the browser to the login page once, for every query and mutation.
const redirectToLoginOnUnauthorized = (error: unknown) => {
   if (error instanceof ApiError && error.statusCode === 401 && window.location.pathname !== '/login') {
      // A full page load on purpose: it drops every cached query along with the dead session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
   }
};

export function Providers({ children }: { children: ReactNode }) {
   const [queryClient] = useState(
      () => new QueryClient({
         queryCache: new QueryCache({ onError: redirectToLoginOnUnauthorized }),
         mutationCache: new MutationCache({ onError: redirectToLoginOnUnauthorized }),
         defaultOptions: {
            queries: { refetchOnWindowFocus: false, staleTime: STALE_TIME_MS },
         },
      }),
   );

   return (
      <QueryClientProvider client={queryClient}>
         <TooltipProvider>{children}</TooltipProvider>
         <Toaster position="bottom-center" />
      </QueryClientProvider>
   );
}
