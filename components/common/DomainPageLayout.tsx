import React, { ComponentProps, ReactNode, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { CSSTransition } from 'react-transition-group';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Footer from './Footer';
import DomainHeader from '../domains/DomainHeader';
import AddDomain from '../domains/AddDomain';
import DomainSettings from '../domains/DomainSettings';
import Settings from '../settings/Settings';
import AddKeywords from '../keywords/AddKeywords';
import { useBranding } from '../../hooks/useBranding';

export type DomainPageModals = {
   showAddKeywords: boolean,
   setShowAddKeywords: (show: boolean) => void,
};

type DomainHeaderExtraProps = Omit<ComponentProps<typeof DomainHeader>, 'domain' | 'domains' | 'showAddModal' | 'showSettingsModal'>;

type DomainPageLayoutProps = {
   activeDomain: DomainType|null,
   domains: DomainType[],
   appSettings: SettingsType,
   trackedKeywords: KeywordType[],
   headerProps: DomainHeaderExtraProps,
   /** Replaces the platform name in the document title, e.g. "Keyword Ideas". */
   titleSuffix?: string,
   /** Rendered above the top bar, e.g. a scraper warning. */
   topBanner?: ReactNode,
   /** Page-specific modals, rendered between the Settings and AddKeywords modals. */
   extraModals?: ReactNode,
   /** Page content rendered below the domain header in the main column. */
   renderContent: (modals: DomainPageModals) => ReactNode,
};

const DomainPageLayout = ({
   activeDomain, domains, appSettings, trackedKeywords, headerProps, titleSuffix, topBanner, extraModals, renderContent,
}: DomainPageLayoutProps) => {
   const { branding } = useBranding();
   const { platformName } = branding;
   const [showAddDomain, setShowAddDomain] = useState(false);
   const [showDomainSettings, setShowDomainSettings] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddKeywords, setShowAddKeywords] = useState(false);
   const addDomainNodeRef = useRef<HTMLDivElement>(null);
   const domainSettingsNodeRef = useRef<HTMLDivElement>(null);
   const settingsNodeRef = useRef<HTMLDivElement>(null);
   const addKeywordsNodeRef = useRef<HTMLDivElement>(null);
   const { scraper_type = '', available_scapers = [] } = appSettings;
   const domainScraperType = activeDomain?.scraper_settings?.scraper_type;
   const activeScraper = useMemo(
      () => available_scapers.find((scraper) => scraper.value === (domainScraperType || scraper_type)),
      [domainScraperType, scraper_type, available_scapers],
   );

   return (
      <div className="Domain">
         {topBanner}
         {activeDomain && activeDomain.domain
         && <Head>
               <title>{`${activeDomain.domain} - ${titleSuffix || platformName}` } </title>
            </Head>
         }
         <TopBar showSettings={() => setShowSettings(true)} showAddModal={() => setShowAddDomain(true)} />
         <div className="flex desktop-container gap-6 lg:gap-10">
            <Sidebar domains={domains} showAddModal={() => setShowAddDomain(true)} />
            <div className="domain_kewywords w-full pt-10 lg:pt-8">
               {activeDomain && activeDomain.domain
               ? <DomainHeader
                  {...headerProps}
                  domain={activeDomain}
                  domains={domains}
                  showAddModal={setShowAddKeywords}
                  showSettingsModal={setShowDomainSettings}
                  />
                  : <div className='w-full lg:h-[100px]'></div>
               }
               {renderContent({ showAddKeywords, setShowAddKeywords })}
            </div>
         </div>

         <CSSTransition in={showAddDomain} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={addDomainNodeRef}>
            <AddDomain ref={addDomainNodeRef} closeModal={() => setShowAddDomain(false)} domains={domains || []} />
         </CSSTransition>

         <CSSTransition in={showDomainSettings} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={domainSettingsNodeRef}>
            <DomainSettings
            ref={domainSettingsNodeRef}
            domain={showDomainSettings && domains && activeDomain && activeDomain.domain ? activeDomain : null}
            closeModal={setShowDomainSettings}
            availableScrapers={available_scapers || []}
            systemScraperType={scraper_type}
            />
         </CSSTransition>
         <CSSTransition in={showSettings} timeout={300} classNames="settings_anim" unmountOnExit mountOnEnter nodeRef={settingsNodeRef}>
             <Settings ref={settingsNodeRef} closeSettings={() => setShowSettings(false)} />
         </CSSTransition>
         {extraModals}
         <CSSTransition in={showAddKeywords} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter nodeRef={addKeywordsNodeRef}>
            <AddKeywords
               ref={addKeywordsNodeRef}
               domain={activeDomain?.domain || ''}
               scraperName={activeScraper?.label || ''}
               keywords={trackedKeywords}
               allowsCity={!!activeScraper?.allowsCity}
               scraperCountries={activeScraper?.scraperCountries}
               closeModal={() => setShowAddKeywords(false)}
               />
         </CSSTransition>
         <Footer currentVersion={appSettings?.version ? appSettings.version : ''} />
      </div>
   );
};

export default DomainPageLayout;
