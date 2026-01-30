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
import { exportKeywordIdeas } from '../../../../utils/client/exportcsv';
import Settings from '../../../../components/settings/Settings';
import dynamic from 'next/dynamic';
import { useFetchDomains, ADWORDS_ENABLED } from '../../../../services/domains';
import { useFetchSettings } from '../../../../services/settings';
import { useFetchKeywordIdeas } from '../../../../services/adwords';
import Modal from '../../../../components/common/Modal';
import Footer from '../../../../components/common/Footer';
import AddKeywords from '../../../../components/keywords/AddKeywords';
import { useFetchKeywords } from '../../../../services/keywords';
import { withAuth } from '../../../../hooks/useAuth';
import { safeJsonParse } from '../../../../utils/safeJsonParse';

const KeywordIdeasTable = dynamic(() => import('../../../../components/ideas/KeywordIdeasTable'));
const KeywordIdeasUpdater = dynamic(() => import('../../../../components/ideas/KeywordIdeasUpdater'));

export const DomainIdeasPage: NextPage = () => {
   const router = useRouter();
   const [showDomainSettings, setShowDomainSettings] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddDomain, setShowAddDomain] = useState(false);
   const [showAddKeywords, setShowAddKeywords] = useState(false);
   const [showUpdateModal, setShowUpdateModal] = useState(false);
   const [showFavorites, setShowFavorites] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const domainSettingsNodeRef = useRef<HTMLDivElement>(null);
   const settingsNodeRef = useRef<HTMLDivElement>(null);
   const addKeywordsNodeRef = useRef<HTMLDivElement>(null);

   const { data: appSettings } = useFetchSettings();
   const appSettingsData: SettingsType = appSettings?.settings || {};
   const { data: domainsData } = useFetchDomains(router, false);
   const adwordsConnected = ADWORDS_ENABLED && Boolean(
      appSettingsData?.adwords_refresh_token
      && appSettingsData?.adwords_developer_token
      && appSettingsData?.adwords_account_id,
   );
   const globalSearchConsoleConnected = Boolean(appSettingsData?.search_console_integrated);
   const { data: keywordIdeasData, isLoading: isLoadingIdeas, isError: errorLoadingIdeas } = useFetchKeywordIdeas(
      router,
      adwordsConnected,
   );
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const keywordIdeas:IdeaKeyword[] = keywordIdeasData?.data?.keywords || [];
   const favorites:IdeaKeyword[] = keywordIdeasData?.data?.favorites || [];
   const keywordIdeasSettings = keywordIdeasData?.data?.settings || undefined;

   const activDomain: DomainType|null = useMemo(() => {
      let active:DomainType|null = null;
      if (domainsData?.domains && router.query?.slug) {
         active = domainsData.domains.find((x:DomainType) => x.slug === router.query.slug) || null;
      }
      return active;
   }, [router.query.slug, domainsData]);

   const domainHasScAPI = useMemo(() => {
      const domainSc = safeJsonParse<DomainSearchConsole | null>(activDomain?.search_console, null);
      return !!(domainSc?.client_email && domainSc?.private_key);
   }, [activDomain]);

   const searchConsoleConnected = globalSearchConsoleConnected || domainHasScAPI;
   const { keywordsData: trackedKeywordsData } = useFetchKeywords(router, activDomain?.domain || '');
   const trackedKeywords: KeywordType[] = (trackedKeywordsData?.keywords || []) as KeywordType[];
   const { scraper_type = '', available_scapers = [] } = appSettingsData;
   const activeScraper = useMemo(
      () => available_scapers.find((scraper) => scraper.value === scraper_type),
      [scraper_type, available_scapers],
   );


   return (
      <div className="Domain ">
         {activDomain && activDomain.domain
         && <Head>
               <title>{`${activDomain.domain} - Keyword Ideas` } </title>
            </Head>
         }
         <TopBar showSettings={() => setShowSettings(true)} showAddModal={() => setShowAddDomain(true)} />
         <div className="flex desktop-container gap-6 lg:gap-10">
            <Sidebar domains={theDomains} showAddModal={() => setShowAddDomain(true)} />
            <div className="domain_kewywords w-full pt-10 lg:pt-8">
               {activDomain && activDomain.domain ? (
                  <DomainHeader
                  domain={activDomain}
                  domains={theDomains}
                  showAddModal={setShowAddKeywords}
                  showSettingsModal={setShowDomainSettings}
                  exportCsv={() => exportKeywordIdeas(showFavorites ? favorites : keywordIdeas, activDomain.domain)}
                  showIdeaUpdateModal={() => setShowUpdateModal(true)}
                  />
               ) : <div className='w-full lg:h-[100px]'></div>}
               {ADWORDS_ENABLED && (
                  <KeywordIdeasTable
                  isLoading={isLoadingIdeas}
                  noIdeasDatabase={errorLoadingIdeas}
                  domain={activDomain}
                  keywords={keywordIdeas}
                  favorites={favorites}
                  isAdwordsIntegrated={adwordsConnected}
                  showFavorites={showFavorites}
                  setShowFavorites={setShowFavorites}
                  />
               )}
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

          {ADWORDS_ENABLED && showUpdateModal && activDomain?.domain && (
             <Modal closeModal={() => setShowUpdateModal(false) } title={'Load Keyword Ideas from Google Ads'} verticalCenter={true}>
                <KeywordIdeasUpdater
                domain={activDomain}
                onUpdate={() => setShowUpdateModal(false)}
                settings={keywordIdeasSettings}
                searchConsoleConnected={searchConsoleConnected}
                adwordsConnected={adwordsConnected}
                />
             </Modal>
          )}
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

export default withAuth(DomainIdeasPage);
