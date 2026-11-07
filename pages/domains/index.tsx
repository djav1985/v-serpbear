import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CSSTransition } from 'react-transition-group';
import toast from 'react-hot-toast';
import TopBar from '../../components/common/TopBar';
import AddDomain from '../../components/domains/AddDomain';
import Settings from '../../components/settings/Settings';
import { useFetchSettings } from '../../services/settings';
import { useFetchDomains } from '../../services/domains';
import { fetchThumbnailBatch, readCachedThumbnail } from '../../services/thumbnails';
import DomainItem from '../../components/domains/DomainItem';
import Footer from '../../components/common/Footer';
import { withAuth } from '../../hooks/useAuth';
import PageLoader from '../../components/common/PageLoader';
import { useBranding } from '../../hooks/useBranding';
import { safeJsonParse } from '../../utils/safeJsonParse';

const Domains: NextPage = () => {
   const router = useRouter();
   const { branding } = useBranding();
   const { platformName } = branding;
   const adsResultHandledRef = useRef(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddDomain, setShowAddDomain] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({});
   const thumbnailNodesRef = useRef<Map<number, Element>>(new Map());
   const thumbnailIdsByNodeRef = useRef<WeakMap<Element, number>>(new WeakMap());
   const thumbnailObserverRef = useRef<IntersectionObserver | null>(null);
   const cacheCheckingRef = useRef<Set<number>>(new Set());
   const queuedRef = useRef<Set<number>>(new Set());
   const inFlightRef = useRef<Set<number>>(new Set());
   const objectUrlsRef = useRef<Map<number, string>>(new Map());
   const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

   const showThumbnail = useCallback((id: number, blob: Blob) => {
      if (!thumbnailNodesRef.current.has(id)) { return; }
      const objectUrl = URL.createObjectURL(blob);
      const oldUrl = objectUrlsRef.current.get(id);
      if (oldUrl) { URL.revokeObjectURL(oldUrl); }
      objectUrlsRef.current.set(id, objectUrl);
      setThumbnailUrls((current) => ({ ...current, [id]: objectUrl }));
   }, []);

   const registerThumbnail = useCallback((id: number, element: HTMLDivElement | null) => {
      if (element) {
         thumbnailNodesRef.current.set(id, element);
         thumbnailIdsByNodeRef.current.set(element, id);
         thumbnailObserverRef.current?.observe(element);
         return;
      }
      const oldElement = thumbnailNodesRef.current.get(id);
      if (oldElement) { thumbnailObserverRef.current?.unobserve(oldElement); }
      thumbnailNodesRef.current.delete(id);
      queuedRef.current.delete(id);
      cacheCheckingRef.current.delete(id);
      inFlightRef.current.delete(id);
      const oldUrl = objectUrlsRef.current.get(id);
      if (oldUrl) { URL.revokeObjectURL(oldUrl); objectUrlsRef.current.delete(id); }
      setThumbnailUrls((current) => {
         if (!(id in current)) { return current; }
         const next = { ...current };
         delete next[id];
         return next;
      });
   }, []);

   useEffect(() => {
      if (typeof IntersectionObserver === 'undefined') { return undefined; }
      const flushBatch = () => {
         flushTimerRef.current = null;
         const ids = Array.from(queuedRef.current).filter((id) => (
            thumbnailNodesRef.current.has(id) && !inFlightRef.current.has(id)
         ));
         queuedRef.current.clear();
         if (ids.length === 0) { return; }
         ids.forEach((id) => inFlightRef.current.add(id));
         fetchThumbnailBatch(ids, (part) => showThumbnail(part.id, part.blob))
            .catch(() => undefined)
            .finally(() => ids.forEach((id) => inFlightRef.current.delete(id)));
      };
      const scheduleBatch = () => {
         if (flushTimerRef.current !== null) { return; }
         flushTimerRef.current = setTimeout(flushBatch, 0);
      };
      const observer = new IntersectionObserver((entries) => {
         const newlyVisible = new Set<number>();
         entries.forEach((entry) => {
            if (!entry.isIntersecting) { return; }
            const id = thumbnailIdsByNodeRef.current.get(entry.target);
            if (id === undefined) { return; }
            observer.unobserve(entry.target);
            if (objectUrlsRef.current.has(id) || cacheCheckingRef.current.has(id) || inFlightRef.current.has(id)) { return; }
            cacheCheckingRef.current.add(id);
            newlyVisible.add(id);
         });
         if (newlyVisible.size === 0) { return; }
         Promise.all(Array.from(newlyVisible).map(async (id) => {
            try {
               const cached = await readCachedThumbnail(id);
               if (cached && thumbnailNodesRef.current.has(id)) {
                  showThumbnail(id, cached.blob);
                  return;
               }
            } catch { /* Treat a cache read failure as a miss. */ }
            if (thumbnailNodesRef.current.has(id) && !inFlightRef.current.has(id)) { queuedRef.current.add(id); }
         })).catch(() => undefined).finally(() => {
            newlyVisible.forEach((id) => cacheCheckingRef.current.delete(id));
            scheduleBatch();
         });
      }, { rootMargin: '300px' });
      thumbnailObserverRef.current = observer;
      thumbnailNodesRef.current.forEach((node) => observer.observe(node));
      const objectUrls = objectUrlsRef.current;
      const thumbnailNodes = thumbnailNodesRef.current;
      const cacheChecking = cacheCheckingRef.current;
      const queued = queuedRef.current;
      const inFlight = inFlightRef.current;
      return () => {
         observer.disconnect();
         thumbnailObserverRef.current = null;
         if (flushTimerRef.current !== null) { clearTimeout(flushTimerRef.current); }
         objectUrls.forEach((url) => URL.revokeObjectURL(url));
         objectUrls.clear();
         thumbnailNodes.clear();
         cacheChecking.clear();
         queued.clear();
         inFlight.clear();
      };
   }, [showThumbnail]);

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
                           thumb={thumbnailUrls[domain.ID]}
                           registerThumbnail={registerThumbnail}
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
