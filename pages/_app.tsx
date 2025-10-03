import '../styles/globals.css';
import React from 'react';
import type { AppProps, AppContext } from 'next/app';
import App from 'next/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { getBranding, type BrandingConfig } from '../utils/branding';

type CustomAppProps = AppProps & {
   pageProps: {
      serverSideBranding?: BrandingConfig;
   };
};

function MyApp({ Component, pageProps }: CustomAppProps) {
   const [queryClient] = React.useState(() => new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
        },
      },
    }));
   return <QueryClientProvider client={queryClient}>
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
