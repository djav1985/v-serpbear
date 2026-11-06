import React, { useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { exportKeywordIdeas } from '../../../../utils/client/exportcsv';
import { useFetchDomains } from '../../../../services/domains';
import { useFetchSettings } from '../../../../services/settings';
import KeywordIdeasTable from '../../../../components/ideas/KeywordIdeasTable';
import { useFetchKeywordIdeas } from '../../../../services/adwords';
import KeywordIdeasUpdater from '../../../../components/ideas/KeywordIdeasUpdater';
import Modal from '../../../../components/common/Modal';
import { useFetchKeywords } from '../../../../services/keywords';
import { withAuth } from '../../../../hooks/useAuth';
import { useActiveDomain, useDomainHasScAPI } from '../../../../hooks/useActiveDomain';
import DomainPageLayout from '../../../../components/common/DomainPageLayout';

export const DomainIdeasPage: NextPage = () => {
   const router = useRouter();
   const [showUpdateModal, setShowUpdateModal] = useState(false);
   const [showFavorites, setShowFavorites] = useState(false);

   const { data: appSettings } = useFetchSettings();
   const appSettingsData: SettingsType = appSettings?.settings || {} as SettingsType;
   const { data: domainsData } = useFetchDomains(router, false);
   const activeDomain = useActiveDomain(router, domainsData);
   const adwordsConnected = Boolean(
      appSettingsData?.adwords_refresh_token
      && appSettingsData?.adwords_developer_token
      && appSettingsData?.adwords_account_id,
   );
   const globalSearchConsoleConnected = Boolean(appSettingsData?.search_console_integrated);
   const { data: keywordIdeasData, isLoading: isLoadingIdeas, isError: errorLoadingIdeas } = useFetchKeywordIdeas(router, adwordsConnected, activeDomain?.domain);
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const keywordIdeas:IdeaKeyword[] = keywordIdeasData?.data?.keywords || [];
   const favorites:IdeaKeyword[] = keywordIdeasData?.data?.favorites || [];
   const keywordIdeasSettings = keywordIdeasData?.data?.settings;

   const domainHasScAPI = useDomainHasScAPI(activeDomain);

   const searchConsoleConnected = globalSearchConsoleConnected || domainHasScAPI;
   const { keywordsData: trackedKeywordsData } = useFetchKeywords(router, activeDomain?.domain || '');
   const trackedKeywords: KeywordType[] = (trackedKeywordsData?.keywords || []) as KeywordType[];

   return (
      <DomainPageLayout
         activeDomain={activeDomain}
         domains={theDomains}
         appSettings={appSettingsData}
         trackedKeywords={trackedKeywords}
         titleSuffix="Keyword Ideas"
         headerProps={{
            exportCsv: () => exportKeywordIdeas(showFavorites ? favorites : keywordIdeas, activeDomain?.domain || ''),
            showIdeaUpdateModal: () => setShowUpdateModal(true),
         }}
         extraModals={showUpdateModal && activeDomain?.domain && (
            <Modal closeModal={() => setShowUpdateModal(false) } title={'Load Keyword Ideas from Google Ads'} verticalCenter={true}>
               <KeywordIdeasUpdater
               domain={activeDomain}
               onUpdate={() => setShowUpdateModal(false)}
               settings={keywordIdeasSettings}
               searchConsoleConnected={searchConsoleConnected}
               adwordsConnected={adwordsConnected}
               />
            </Modal>
         )}
         renderContent={() => (
            <KeywordIdeasTable
            isLoading={isLoadingIdeas}
            noIdeasDatabase={errorLoadingIdeas}
            domain={activeDomain}
            keywords={keywordIdeas}
            favorites={favorites}
            isAdwordsIntegrated={adwordsConnected}
            showFavorites={showFavorites}
            setShowFavorites={setShowFavorites}
            />
         )}
      />
   );
};

export default withAuth(DomainIdeasPage);
