import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BrandingConfig } from '../utils/branding';
import { DEFAULT_BRANDING, getBranding } from '../utils/branding';

export const BRANDING_QUERY_KEY = ['branding-config'] as const;

export const fetchBrandingConfig = async (): Promise<BrandingConfig> => {
   const response = await fetch('/api/branding/config', {
      headers: {
         Accept: 'application/json',
      },
   });

   if (!response.ok) {
      throw new Error(`Failed to load branding config: ${response.status}`);
   }

   return response.json() as Promise<BrandingConfig>;
};

const isClient = typeof window !== 'undefined';

// Get server-side branding during SSR
const getServerSideBranding = (): BrandingConfig | undefined => {
   if (isClient) {
      // On client, check if we have server-side props injected
      // This will be available on first render from _app.tsx pageProps
      try {
         const appProps = (window as any).__NEXT_DATA__?.props?.pageProps;
         return appProps?.serverSideBranding;
      } catch {
         return undefined;
      }
   }
   // On server, get branding directly
   return getBranding();
};

export const useBranding = () => {
   const serverSideBranding = useMemo(() => getServerSideBranding(), []);
   
   const queryResult = useQuery({
      queryKey: BRANDING_QUERY_KEY,
      queryFn: fetchBrandingConfig,
      enabled: isClient,
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      suspense: false,
      initialData: serverSideBranding,
      placeholderData: serverSideBranding || DEFAULT_BRANDING,
   });

   const brandingState = useMemo(() => ({
      branding: queryResult.data ?? serverSideBranding ?? DEFAULT_BRANDING,
      isLoading: queryResult.isLoading && queryResult.isFetching,
      isFetching: queryResult.isFetching,
      isError: queryResult.isError,
      refetch: queryResult.refetch,
   }), [queryResult.data, queryResult.isError, queryResult.isFetching, queryResult.isLoading, queryResult.refetch, serverSideBranding]);

   return brandingState;
};

export type UseBrandingReturn = ReturnType<typeof useBranding>;
