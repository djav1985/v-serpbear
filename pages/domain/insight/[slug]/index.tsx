import React from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
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
   const { data: appSettings } = useFetchSettings();
   const appSettingsData: SettingsType = appSettings?.settings || {} as SettingsType;
   const { data: domainsData } = useFetchDomains(router, false);
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const activeDomain = useActiveDomain(router, domainsData);
   const domainHasScAPI = useDomainHasScAPI(activeDomain);
   const scConnected = !!appSettingsData.search_console_integrated;
   const domainsLoaded = !!(domainsData?.domains?.length);
   const { data: insightData, isLoading: isInsightLoading, isError: isInsightError } = useFetchSCInsight(
      router,
      domainsLoaded && scConnected,
      domainsLoaded && domainHasScAPI,
      activeDomain?.domain,
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
            // The export and date filter controls are hidden on the insight page
            exportCsv: () => undefined,
         }}
         renderContent={() => (
            <SCInsight
            isLoading={isInsightLoading}
            isError={isInsightError}
            domain={activeDomain}
            insight={theInsight}
            isConsoleIntegrated={scConnected || domainHasScAPI}
            />
         )}
      />
   );
};

export default withAuth(DomainInsightPage);
