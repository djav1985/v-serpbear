import React, { useMemo, useRef, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { CSSTransition } from 'react-transition-group';
import Sidebar from '../../../../components/common/Sidebar';
import TopBar from '../../../../components/common/TopBar';
import DomainHeader from '../../../../components/domains/DomainHeader';
import AddDomain from '../../../../components/domains/AddDomain';
import DomainSettings from '../../../../components/domains/DomainSettings';
import exportCSV from '../../../../utils/client/exportcsv';
import Settings from '../../../../components/settings/Settings';
import { useFetchDomains } from '../../../../services/domains';
import { useFetchSCKeywords } from '../../../../services/searchConsole';
import SCKeywordsTable from '../../../../components/keywords/SCKeywordsTable';
import { useFetchSettings } from '../../../../services/settings';
import Footer from '../../../../components/common/Footer';
import { useBranding } from '../../../../hooks/useBranding';
import AddKeywords from '../../../../components/keywords/AddKeywords';
import { useFetchKeywords } from '../../../../services/keywords';
import { withAuth } from '../../../../hooks/useAuth';
import { safeJsonParse } from '../../../../utils/safeJsonParse';

/**
 * Collapses Search Console rows (one per date) into one row per device/country/keyword.
 * Clicks and impressions are summed; CTR is total clicks / total impressions (in percent);
 * position is weighted by impressions. Without impressions, position falls back to a plain average.
 */
export const aggregateSCKeywords = (rows: SearchAnalyticsItem[]): SearchAnalyticsItem[] => {
   const groups = new Map<string, {
      base: SearchAnalyticsItem,
      clicks: number,
      impressions: number,
      positionWeighted: number,
      positionSum: number,
      count: number,
   }>();

   rows.forEach((row) => {
      const key = `${row.device}-${row.country}-${row.keyword}`;
      const group = groups.get(key) || {
         base: row, clicks: 0, impressions: 0, positionWeighted: 0, positionSum: 0, count: 0,
      };
      group.clicks += row.clicks;
      group.impressions += row.impressions;
      group.positionWeighted += row.position * row.impressions;
      group.positionSum += row.position;
      group.count += 1;
      groups.set(key, group);
   });

   return [...groups.values()].map(({ base, clicks, impressions, positionWeighted, positionSum, count }) => ({
      ...base,
      clicks,
      impressions,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      position: impressions > 0 ? Math.round(positionWeighted / impressions) : Math.round(positionSum / count),
   }));
};

export const DomainConsolePage: NextPage = () => {
   const router = useRouter();
   const { branding } = useBranding();
   const { platformName } = branding;
   const [showDomainSettings, setShowDomainSettings] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddKeywords, setShowAddKeywords] = useState(false);
   const [showAddDomain, setShowAddDomain] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const domainSettingsNodeRef = useRef<HTMLDivElement>(null);
   const settingsNodeRef = useRef<HTMLDivElement>(null);
   const addKeywordsNodeRef = useRef<HTMLDivElement>(null);
   const [scDateFilter, setSCDateFilter] = useState('thirtyDays');
   const { data: appSettings } = useFetchSettings();
   const appSettingsData: SettingsType = appSettings?.settings || {} as SettingsType;
   const { data: domainsData } = useFetchDomains(router, false);
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const activDomain: DomainType|null = useMemo(() => {
      if (domainsData?.domains && router.query?.slug) {
         return domainsData.domains.find((x:DomainType) => x.slug === router.query.slug) || null;
      }
      return null;
   }, [router.query.slug, domainsData]);
   const domainHasScAPI = useMemo(() => {
      const domainSc = safeJsonParse<DomainSearchConsole | null>(activDomain?.search_console, null);
      return !!(domainSc?.client_email && domainSc?.private_key);
   }, [activDomain]);
   const scConnected = !!appSettingsData.search_console_integrated;
   const domainsLoaded = !!(domainsData?.domains?.length);
   const { data: keywordsData, isLoading: keywordsLoading, isFetching } = useFetchSCKeywords(
      router,
      domainsLoaded && scConnected,
      domainsLoaded && domainHasScAPI,
   );

   const { keywordsData: trackedKeywordsData } = useFetchKeywords(router, activDomain?.domain || '');
   const trackedKeywords: KeywordType[] = (trackedKeywordsData?.keywords || []) as KeywordType[];
   const { scraper_type = '', available_scapers = [] } = appSettingsData;
   const activeScraper = useMemo(
      () => available_scapers.find((scraper) => scraper.value === scraper_type),
      [scraper_type, available_scapers],
   );

   const theKeywords: SearchAnalyticsItem[] = useMemo(() => {
      const scData = keywordsData?.data as (SCDomainDataType & Record<string, SearchAnalyticsItem[]>) | undefined;
      return scData && scData[scDateFilter] ? scData[scDateFilter] : [];
   }, [keywordsData, scDateFilter]);

   const theKeywordsGrouped : SearchAnalyticsItem[] = useMemo(() => aggregateSCKeywords(theKeywords), [theKeywords]);

   const isConsoleIntegrated = scConnected || domainHasScAPI;

   return (
      <div className="Domain ">
         {activDomain && activDomain.domain
         && <Head>
               <title>{`${activDomain.domain} - ${platformName}` } </title>
            </Head>
         }
         <TopBar showSettings={() => setShowSettings(true)} showAddModal={() => setShowAddDomain(true)} />
         <div className="flex desktop-container gap-6 lg:gap-10">
            <Sidebar domains={theDomains} showAddModal={() => setShowAddDomain(true)} />
            <div className="domain_kewywords w-full pt-10 lg:pt-8">
               {activDomain && activDomain.domain
               ? <DomainHeader
                  domain={activDomain}
                  domains={theDomains}
                  showAddModal={setShowAddKeywords}
                  showSettingsModal={setShowDomainSettings}
                  exportCsv={() => exportCSV(theKeywordsGrouped, activDomain.domain, scDateFilter)}
                  scFilter={scDateFilter}
                  setScFilter={(item:string) => setSCDateFilter(item)}
                  />
                  : <div className='w-full lg:h-[100px]'></div>
               }
               <SCKeywordsTable
               isLoading={keywordsLoading || isFetching}
               domain={activDomain}
               keywords={theKeywordsGrouped}
               isConsoleIntegrated={isConsoleIntegrated}
            />
            </div>
         </div>

         <CSSTransition in={showAddDomain} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={addDomainNodeRef}>
            <AddDomain ref={addDomainNodeRef} closeModal={() => setShowAddDomain(false)} domains={domainsData?.domains || []} />
         </CSSTransition>

         <CSSTransition in={showDomainSettings} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={domainSettingsNodeRef}>
            <DomainSettings
            ref={domainSettingsNodeRef}
            domain={showDomainSettings && theDomains && activDomain && activDomain.domain ? activDomain : null}
            closeModal={setShowDomainSettings}
            availableScrapers={available_scapers || []}
            systemScraperType={scraper_type}
            />
         </CSSTransition>
         <CSSTransition in={showSettings} timeout={300} classNames="settings_anim" unmountOnExit mountOnEnter nodeRef={settingsNodeRef}>
             <Settings ref={settingsNodeRef} closeSettings={() => setShowSettings(false)} />
         </CSSTransition>
         <CSSTransition in={showAddKeywords} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={addKeywordsNodeRef}>
            <AddKeywords
               ref={addKeywordsNodeRef}
               domain={activDomain?.domain || ''}
               scraperName={activeScraper?.label || ''}
               keywords={trackedKeywords}
               allowsCity={!!activeScraper?.allowsCity}
               scraperCountries={activeScraper?.scraperCountries}
               closeModal={() => setShowAddKeywords(false)}
            />
         </CSSTransition>
         <Footer currentVersion={appSettingsData?.version ? appSettingsData.version : ''} />
      </div>
   );
};

export default withAuth(DomainConsolePage);
