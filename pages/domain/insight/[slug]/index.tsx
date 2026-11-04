import React, { useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import exportCSV from '../../../../utils/client/exportcsv';
import { useFetchDomains } from '../../../../services/domains';
import { useFetchSCInsight } from '../../../../services/searchConsole';
import SCInsight from '../../../../components/insight/Insight';
import { useFetchSettings } from '../../../../services/settings';
import { useFetchKeywords } from '../../../../services/keywords';
import { withAuth } from '../../../../hooks/useAuth';
import { useActiveDomain, useDomainHasScAPI } from '../../../../hooks/useActiveDomain';
import DomainPageLayout from '../../../../components/common/DomainPageLayout';

export const DomainInsightPage: NextPage = () => {
   const router = useRouter();
   const [scDateFilter, setSCDateFilter] = useState('thirtyDays');
   const { data: appSettings } = useFetchSettings();
   const appSettingsData: SettingsType = appSettings?.settings || {} as SettingsType;
   const { data: domainsData } = useFetchDomains(router, false);
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const activeDomain = useActiveDomain(router, domainsData);
   const domainHasScAPI = useDomainHasScAPI(activeDomain);
   const scConnected = !!appSettingsData.search_console_integrated;
   const domainsLoaded = !!(domainsData?.domains?.length);
   const { data: insightData } = useFetchSCInsight(
      router,
      domainsLoaded && scConnected,
      domainsLoaded && domainHasScAPI,
   );

   const theInsight: InsightDataType = insightData && insightData.data ? insightData.data : { stats: null, keywords: [], countries: [], pages: [] };
   const { keywordsData: trackedKeywordsData } = useFetchKeywords(router, activeDomain?.domain || '');
   const trackedKeywords: KeywordType[] = (trackedKeywordsData?.keywords || []) as KeywordType[];

   return (
      <DomainPageLayout
         activeDomain={activeDomain}
         domains={theDomains}
         appSettings={appSettingsData}
         trackedKeywords={trackedKeywords}
         headerProps={{
            exportCsv: () => exportCSV([], activeDomain?.domain || '', scDateFilter),
            scFilter: scDateFilter,
            setScFilter: (item:string) => setSCDateFilter(item),
         }}
         renderContent={() => (
            <SCInsight
            isLoading={false}
            domain={activeDomain}
            insight={theInsight}
            isConsoleIntegrated={scConnected || domainHasScAPI}
            />
         )}
      />
   );
};

export default withAuth(DomainInsightPage);
