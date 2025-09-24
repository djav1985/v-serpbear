import React, { useMemo, useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
// import { useQuery } from 'react-query';
// import toast from 'react-hot-toast';
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

const DiscoverPage: NextPage = () => {
   const router = useRouter();
   const [showDomainSettings, setShowDomainSettings] = useState(false);
   const [showSettings, setShowSettings] = useState(false);
   const [showAddDomain, setShowAddDomain] = useState(false);
   const [scDateFilter, setSCDateFilter] = useState('thirtyDays');
   const { data: appSettings } = useFetchSettings();
   const { data: domainsData } = useFetchDomains(router, false);
   const scConnected = !!(appSettings && appSettings?.settings?.search_console_integrated);
   const { data: keywordsData, isLoading: keywordsLoading, isFetching } = useFetchSCKeywords(router, !!(domainsData?.domains?.length) && scConnected);

   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const theKeywords: SearchAnalyticsItem[] = useMemo(() => keywordsData?.data && keywordsData.data[scDateFilter] ? keywordsData.data[scDateFilter] : [], [keywordsData, scDateFilter]);

   const theKeywordsCount = useMemo(() => theKeywords.reduce<Map<string, number>>((r, o) => {
         const key = `${o.device}-${o.country}-${o.keyword}`;
         const item = r.get(key) || 0;
         return r.set(key, item + 1);
      }, new Map()) || [], [theKeywords]);

   const theKeywordsReduced : SearchAnalyticsItem[] = useMemo(() => [...theKeywords.reduce<Map<string, SearchAnalyticsItem>>((r, o) => {
         const key = `${o.device}-${o.country}-${o.keyword}`;
         const item = r.get(key) || { ...o,
            ...{
            clicks: 0,
            impressions: 0,
            ctr: 0,
            position: 0,
            },
         };
         item.clicks += o.clicks;
         item.impressions += o.impressions;
         item.ctr = o.ctr + item.ctr;
         item.position = o.position + item.position;
         return r.set(key, item);
      }, new Map()).values()], [theKeywords]);

   const theKeywordsGrouped : SearchAnalyticsItem[] = useMemo(() => [...theKeywordsReduced.map<SearchAnalyticsItem>((o: SearchAnalyticsItem) => {
         const key = `${o.device}-${o.country}-${o.keyword}`;
         const count = theKeywordsCount?.get(key) || 0;
         return { ...o,
            ...{
            ctr: Math.round((o.ctr / count) * 100) / 100,
            position: Math.round(o.position / count),
            },
         };
      })], [theKeywordsReduced, theKeywordsCount]);

   const activDomain: DomainType|null = useMemo(() => {
      let active:DomainType|null = null;
      if (domainsData?.domains && router.query?.slug) {
         active = domainsData.domains.find((x:DomainType) => x.slug === router.query.slug) || null;
      }
      return active;
   }, [router.query.slug, domainsData]);

   const domainHasScAPI = useMemo(() => {
      const domainSc = activDomain?.search_console ? JSON.parse(activDomain.search_console) : {};
      return !!(domainSc?.client_email && domainSc?.private_key);
   }, [activDomain]);

   return (
      <div className="Domain ">
         {activDomain && activDomain.domain
         && <Head>
               <title>{`${activDomain.domain} - SerpBear` } </title>
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
                  showAddModal={() => console.log('XXXXX')}
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
               isConsoleIntegrated={scConnected || domainHasScAPI}
               />
            </div>
         </div>

         <CSSTransition in={showAddDomain} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter>
            <AddDomain closeModal={() => setShowAddDomain(false)} domains={domainsData?.domains || []} />
         </CSSTransition>

         <CSSTransition in={showDomainSettings} timeout={300} classNames="modal_anim" unmountOnExit mountOnEnter>
            <DomainSettings
            domain={showDomainSettings && theDomains && activDomain && activDomain.domain ? activDomain : null}
            closeModal={setShowDomainSettings}
            />
         </CSSTransition>
         <CSSTransition in={showSettings} timeout={300} classNames="settings_anim" unmountOnExit mountOnEnter>
             <Settings closeSettings={() => setShowSettings(false)} />
         </CSSTransition>
         <Footer currentVersion={appSettings?.settings?.version ? appSettings.settings.version : ''} />
      </div>
   );
};

export default DiscoverPage;
