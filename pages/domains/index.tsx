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
import { fetchDomainScreenshot, useFetchDomains, SCREENSHOTS_ENABLED } from '../../services/domains';
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
   // const [noScrapprtError, setNoScrapprtError] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddDomain, setShowAddDomain] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const [domainThumbs, setDomainThumbs] = useState<thumbImages>({});
   const settingsNodeRef = useRef<HTMLDivElement>(null);
   const { data: appSettingsData, isLoading: isAppSettingsLoading } = useFetchSettings();
   const { data: domainsData, isLoading: isDomainsLoading } = useFetchDomains(router, true);

   const appSettings:SettingsType = appSettingsData?.settings || {};
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
            const doaminSc = safeJsonParse<DomainSearchConsole | null>(domain?.search_console, null);
            domainsSCAPI[domain.ID] = !!(doaminSc?.client_email && doaminSc?.private_key);
         });
      }
      return domainsSCAPI;
   }, [domainsData]);

   useEffect(() => {
      if (!SCREENSHOTS_ENABLED) { return; }
      if (domainsData?.domains && domainsData.domains.length > 0) {
         const fetchAllScreenshots = async () => {
            const screenshotPromises = domainsData.domains.map(async (domain: DomainType) => {
               const domainThumb = await fetchDomainScreenshot(domain.domain);
               if (domainThumb) {
                  return { domain: domain.domain, thumb: domainThumb };
               }
               return null;
            });

            // Use allSettled to handle individual screenshot failures gracefully
            const screenshots = await Promise.allSettled(screenshotPromises);
            const validScreenshots = screenshots
               .filter((result): result is PromiseFulfilledResult<{ domain: string; thumb: string }> =>
                  result.status === 'fulfilled' && result.value !== null)
               .map((result) => result.value as { domain: string; thumb: string });

            if (validScreenshots.length > 0) {
               setDomainThumbs((currentThumbs) => {
                  const newThumbs = { ...currentThumbs };
                  validScreenshots.forEach(({ domain, thumb }) => {
                     if (thumb) {
                        newThumbs[domain] = thumb;
                     }
                  });
                  return newThumbs;
               });
            }
         };

         fetchAllScreenshots();
      }
   }, [domainsData]);

   const manuallyUpdateThumb = async (domain: string) => {
      if (!SCREENSHOTS_ENABLED) { return; }
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
                  A Scrapper/Proxy has not been set up Yet. Open Settings to set it up and start using the app.
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
                           selected={false}
                           isConsoleIntegrated={!!(appSettings && appSettings.search_console_integrated) || !!domainSCAPiObj[domain.ID] }
                           thumb={domainThumbs[domain.domain]}
                           updateThumb={manuallyUpdateThumb}
                           screenshotsEnabled={SCREENSHOTS_ENABLED}
                           showMapPackStat={showMapPackStat}
                           // isConsoleIntegrated={false}
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
