import '../styles/globals.css';
import React from 'react';
import type { AppProps, AppContext } from 'next/app';
import App from 'next/app';
import Head from 'next/head';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
import { Toaster } from 'react-hot-toast';
import { getBranding, type BrandingConfig } from '../utils/branding';
import { useBranding } from '../hooks/useBranding';

type CustomAppProps = AppProps & {
   pageProps: {
      serverSideBranding?: BrandingConfig;
   };
};

// With white label on and data/favicon.ico present, the tab icon is that file; otherwise it is the default icon.
// It reads the runtime branding config, because getInitialProps also runs in the browser on client-side navigation,
// where the server's files and environment are not available.
function TabIcon() {
   const { branding } = useBranding();
   return <Head><link rel="icon" href={branding.hasCustomFavicon ? branding.faviconApiPath : '/favicon.ico'} /></Head>;
}

function MyApp({ Component, pageProps }: CustomAppProps) {
   const [queryClient] = React.useState(() => new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
        },
      },
    }));
   return <QueryClientProvider client={queryClient}>
            <TabIcon />
            <Component {...pageProps} />
            <ReactQueryDevtools initialIsOpen={false} />
            <Toaster position="bottom-center" containerClassName="react_toaster" />
          </QueryClientProvider>;
}

MyApp.getInitialProps = async (appContext: AppContext) => {
   const appProps = await App.getInitialProps(appContext);
   
   // Provide server-side branding for SSR
   const serverSideBranding = getBranding();
   
   return {
      ...appProps,
      pageProps: {
         ...appProps.pageProps,
         serverSideBranding,
      },
   };
};

export default MyApp;
