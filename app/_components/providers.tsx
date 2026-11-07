'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from 'components/ui/tooltip';

// Server seeds and browser queries share one set of defaults so hydrated data is not refetched on mount.
const STALE_TIME_MS = 30_000;

export function Providers({ children }: { children: ReactNode }) {
   const [queryClient] = useState(
      () => new QueryClient({
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
