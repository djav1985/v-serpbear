import '../styles/globals.css';
import React from 'react';
import type { AppProps, AppContext } from 'next/app';
import App from 'next/app';
import Head from 'next/head';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
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
   // With white label on, the tab icon comes from data/favicon.ico (or the default icon when that file is missing)
   const tabIcon = pageProps.serverSideBranding?.whiteLabelEnabled ? '/api/branding/favicon.ico' : '/favicon.ico';
   return <QueryClientProvider client={queryClient}>
            <Head>
               <link rel="icon" href={tabIcon} />
            </Head>
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
