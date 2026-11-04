import React, { useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import KeywordsTable from '../../../components/keywords/KeywordsTable';
import exportCSV from '../../../utils/client/exportcsv';
import { useFetchDomains } from '../../../services/domains';
import { useFetchKeywords } from '../../../services/keywords';
import { useFetchSettings } from '../../../services/settings';
import { withAuth } from '../../../hooks/useAuth';
import { useActiveDomain, useDomainHasScAPI } from '../../../hooks/useActiveDomain';
import DomainPageLayout from '../../../components/common/DomainPageLayout';

export const DomainPage: NextPage = () => {
   const router = useRouter();
   const [keywordSPollInterval, setKeywordSPollInterval] = useState<undefined|number>(undefined);
   const { data: appSettingsData, isLoading: isAppSettingsLoading } = useFetchSettings();
   const { data: domainsData } = useFetchDomains(router, false);
   const appSettings: SettingsType = appSettingsData?.settings || {} as SettingsType;
   const { scraper_type = '' } = appSettings;
   const activeDomain = useActiveDomain(router, domainsData);
   const domainHasScAPI = useDomainHasScAPI(activeDomain);

   const { keywordsData, keywordsLoading } = useFetchKeywords(router, activeDomain?.domain || '', setKeywordSPollInterval, keywordSPollInterval);
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const theKeywords: KeywordType[] = (keywordsData?.keywords || []) as KeywordType[];

   return (
      <DomainPageLayout
         activeDomain={activeDomain}
         domains={theDomains}
         appSettings={appSettings}
         trackedKeywords={theKeywords}
         headerProps={{ exportCsv: () => exportCSV(theKeywords, activeDomain?.domain || '') }}
         topBanner={(!isAppSettingsLoading && scraper_type === 'none') ? (
            <div className=' p-3 bg-red-600 text-white text-sm text-center'>
               A scraper has not been set up yet. Open Settings to configure it and start using the app.
            </div>
         ) : null}
         renderContent={({ showAddKeywords, setShowAddKeywords }) => (
            <KeywordsTable
            isLoading={keywordsLoading}
            domain={activeDomain}
            keywords={theKeywords}
            showAddModal={showAddKeywords}
            setShowAddModal={setShowAddKeywords}
            isConsoleIntegrated={!!(appSettings && appSettings.search_console_integrated) || domainHasScAPI }
            settings={appSettings}
            />
         )}
      />
   );
};

export default withAuth(DomainPage);
