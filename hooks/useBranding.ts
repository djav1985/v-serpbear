import { useMemo } from 'react';
import { useQuery } from 'react-query';
import type { BrandingConfig } from '../utils/branding';
import { DEFAULT_BRANDING, getBranding } from '../utils/branding';
import { apiGet } from '../utils/client/apiClient';

// Runtime config from /api/branding/config, read on the server at request time
export type RuntimeBrandingConfig = BrandingConfig;

export type BrandingState = {
   branding: BrandingConfig;
   isLoading: boolean;
   isFetching: boolean;
   isError: boolean;
   refetch: ReturnType<typeof useQuery>['refetch'];
};

const BRANDING_QUERY_KEY = ['branding-config'] as const;

const fetchBrandingConfig = async (): Promise<RuntimeBrandingConfig> => apiGet<RuntimeBrandingConfig>('/api/branding/config');

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

   // No initialData: the runtime config must always be fetched on the client, because the browser cannot see the
   // server's environment or data folder. Display falls back to serverSideBranding meanwhile.
   const queryResult = useQuery<RuntimeBrandingConfig>(BRANDING_QUERY_KEY, fetchBrandingConfig, {
      enabled: isClient,
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      suspense: false,
      placeholderData: serverSideBranding || DEFAULT_BRANDING,
   });

   const brandingState = useMemo<BrandingState>(() => ({
      branding: queryResult.data ?? serverSideBranding ?? DEFAULT_BRANDING,
      // With placeholderData react-query reports status 'success', so loading is the placeholder still being shown while fetching
      isLoading: queryResult.isPlaceholderData && queryResult.isFetching,
      isFetching: queryResult.isFetching,
      isError: queryResult.isError,
      refetch: queryResult.refetch,
   }), [queryResult.data, queryResult.isError, queryResult.isFetching, queryResult.isPlaceholderData, queryResult.refetch, serverSideBranding]);

   return brandingState;
};
