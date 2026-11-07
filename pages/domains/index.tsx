import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CSSTransition } from 'react-transition-group';
import toast from 'react-hot-toast';
import TopBar from '../../components/common/TopBar';
import AddDomain from '../../components/domains/AddDomain';
import Settings from '../../components/settings/Settings';
import { useFetchSettings } from '../../services/settings';
import { fetchDomainScreenshot, useFetchDomains } from '../../services/domains';
import DomainItem from '../../components/domains/DomainItem';
import Footer from '../../components/common/Footer';
import { withAuth } from '../../hooks/useAuth';
import PageLoader from '../../components/common/PageLoader';
import { useBranding } from '../../hooks/useBranding';
import { safeJsonParse } from '../../utils/safeJsonParse';

type thumbImages = { [domain:string] : string }

const Domains: NextPage = () => {
   const router = useRouter();
   const { branding } = useBranding();
   const { platformName } = branding;
   const adsResultHandledRef = useRef(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddDomain, setShowAddDomain] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const [domainThumbs, setDomainThumbs] = useState<thumbImages>({});
   const settingsNodeRef = useRef<HTMLDivElement>(null);
   const { data: appSettingsData, isLoading: isAppSettingsLoading, refetch: refetchSettings } = useFetchSettings();
   const { data: domainsData, isLoading: isDomainsLoading } = useFetchDomains(router, true);

   const appSettings:SettingsType = (appSettingsData?.settings || {}) as SettingsType;
   const { scraper_type = '', available_scapers = [] } = appSettings;

   const activeScraper = useMemo(
      () => available_scapers.find((scraper) => scraper.value === scraper_type),
      [available_scapers, scraper_type],
   );
   const showMapPackStat = activeScraper?.supportsMapPack === true;

   const totalKeywords = useMemo(() => {
      let keywords = 0;
      if (domainsData?.domains) {
         domainsData.domains.forEach((domain:DomainType) => {
            keywords += domain?.keywordsTracked || 0;
         });
      }
      return keywords;
   }, [domainsData]);

   const domainSCAPiObj = useMemo(() => {
      const domainsSCAPI:{ [ID:string] : boolean } = {};
      if (domainsData?.domains) {
         domainsData.domains.forEach((domain:DomainType) => {
            const domainSc = safeJsonParse<DomainSearchConsole | null>(domain?.search_console, null);
            domainsSCAPI[domain.ID] = !!(domainSc?.client_email && domainSc?.private_key);
         });
      }
      return domainsSCAPI;
   }, [domainsData]);

   // Google Ads OAuth fallback: the callback redirects to /domains?ads=integrated&status=...
   // Handled on mount here (the Settings drawer may not be open). The param is removed afterwards so
   // it is never handled twice.
   useEffect(() => {
      if (!router.isReady || adsResultHandledRef.current) { return; }
      const { ads, status, detail, ...rest } = router.query;
      if (ads !== 'integrated' || !status) { return; }
      adsResultHandledRef.current = true;

      if (status === 'success') {
         toast('Google Ads has been integrated successfully!', { icon: '✔️' });
         refetchSettings().catch(() => {
            // Silently handle refetch errors
         });
      } else {
         toast(
            (typeof detail === 'string' && detail) || 'Google Ads integration failed. Please try again.',
            { icon: '⚠️' },
         );
      }
      const remainingQuery = Object.fromEntries(
         Object.entries(rest).filter(([, value]) => value !== undefined),
      );
      router.replace({ pathname: router.pathname, query: remainingQuery }, undefined, { shallow: true });
   }, [router, refetchSettings]);

   useEffect(() => {
      const domains = domainsData?.domains;
      if (!domains || domains.length === 0) { return undefined; }
      const SCREENSHOT_CONCURRENCY = 3;
      // A screenshot that is still being generated is not available yet, so the favicon stays and the domain is asked
      // for again a few times, 10 seconds apart
      const RETRY_DELAY_MS = 10000;
      const MAX_ATTEMPTS = 4;
      let cancelled = false;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;

      // Fetches the screenshots of the given domains and returns the ones that are not available yet
      const fetchScreenshots = async (names: string[]): Promise<string[]> => {
         const found: Record<string, string> = {};
         let nextIndex = 0;

         // Worker function: each worker picks up the next available domain
         const worker = async (): Promise<void> => {
            while (nextIndex < names.length) {
               const name = names[nextIndex];
               nextIndex += 1;
               try {
                  const domainThumb = await fetchDomainScreenshot(name);
                  if (domainThumb) { found[name] = domainThumb; }
               } catch {
                  // Individual failures are handled inside fetchDomainScreenshot
               }
            }
         };

         // Start at most SCREENSHOT_CONCURRENCY workers in parallel
         await Promise.all(
            Array.from({ length: Math.min(SCREENSHOT_CONCURRENCY, names.length) }, worker),
         );

         if (!cancelled && Object.keys(found).length > 0) {
            setDomainThumbs((currentThumbs) => ({ ...currentThumbs, ...found }));
         }
         return names.filter((name) => !found[name]);
      };

      const run = async () => {
         let missing = domains.map((item) => item.domain);
         for (let attempt = 0; attempt < MAX_ATTEMPTS && missing.length > 0 && !cancelled; attempt += 1) {
            if (attempt > 0) {
               await new Promise<void>((resolve) => { retryTimer = setTimeout(resolve, RETRY_DELAY_MS); });
               if (cancelled) { return; }
            }
            missing = await fetchScreenshots(missing);
         }
      };

      run();
      return () => {
         cancelled = true;
         if (retryTimer) { clearTimeout(retryTimer); }
      };
   }, [domainsData]);

   const manuallyUpdateThumb = async (domain: string) => {
      const domainThumb = await fetchDomainScreenshot(domain, true);
      if (domainThumb) {
         toast(`${domain} Screenshot Updated Successfully!`, { icon: '✔️' });
         setDomainThumbs((currentThumbs) => ({ ...currentThumbs, [domain]: domainThumb }));
      } else {
         toast(`Failed to Fetch ${domain} Screenshot!`, { icon: '⚠️' });
      }
   };

   const isPageLoading = isAppSettingsLoading || isDomainsLoading || !router.isReady;

   return (
      <PageLoader
         isLoading={isPageLoading}
         className="Domain flex flex-col min-h-screen"
         data-testid="domains"
      >
         {(!isAppSettingsLoading && scraper_type === 'none') && (
               <div className=' p-3 bg-red-600 text-white text-sm text-center'>
                  A scraper has not been set up yet. Open Settings to configure it and start using the app.
               </div>
         )}
         <Head>
            <title>Domains - {platformName}</title>
         </Head>
         <TopBar showSettings={() => setShowSettings(true)} showAddModal={() => setShowAddDomain(true)} />

         <div className="flex flex-col desktop-container py-6 lg:mt-24">
            <div className='flex justify-between mb-2 items-center'>
               <div className=' text-sm text-gray-600'>
                  {domainsData?.domains?.length || 0} Domains <span className=' text-gray-300 ml-1 mr-1'>|</span> {totalKeywords} keywords
               </div>
               <div>
                  <button
                  data-testid="addDomainButton"
                  className={'ml-2 inline-block py-2 text-blue-700 font-bold text-sm'}
                  onClick={() => setShowAddDomain(true)}>
                     <span
                     className='text-center leading-4 mr-2 inline-block rounded-full w-7 h-7 pt-1 bg-blue-700 text-white font-bold text-lg'>+</span>
                     <i className=' not-italic hidden lg:inline-block'>Add Domain</i>
                  </button>
               </div>
            </div>
            <div className='flex w-full flex-col mb-8'>
               {domainsData?.domains && domainsData.domains.map((domain:DomainType) => <DomainItem
                           key={domain.ID}
                           domain={domain}
                           isConsoleIntegrated={!!(appSettings && appSettings.search_console_integrated) || !!domainSCAPiObj[domain.ID] }
                           thumb={domainThumbs[domain.domain]}
                           updateThumb={manuallyUpdateThumb}
                           showMapPackStat={showMapPackStat}
                           />)}
               {!isDomainsLoading && domainsData && domainsData.domains && domainsData.domains.length === 0 && (
                  <div className='noDomains mt-4 p-5 py-12 rounded border text-center bg-white text-sm'>
                     No Domains Found. Add a Domain to get started!
                  </div>
               )}
            </div>
         </div>

         <CSSTransition in={showAddDomain} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={addDomainNodeRef}>
            <AddDomain ref={addDomainNodeRef} closeModal={() => setShowAddDomain(false)} domains={domainsData?.domains || []} />
         </CSSTransition>
         <CSSTransition in={showSettings} timeout={300} classNames="settings_anim" unmountOnExit mountOnEnter nodeRef={settingsNodeRef}>
             <Settings ref={settingsNodeRef} closeSettings={() => setShowSettings(false)} />
         </CSSTransition>
         <Footer currentVersion={appSettings?.version ? appSettings.version : ''} />
      </PageLoader>
   );
};

export default withAuth(Domains);
