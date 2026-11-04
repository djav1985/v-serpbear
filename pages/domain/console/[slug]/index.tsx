import React, { useMemo, useState } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import exportCSV from '../../../../utils/client/exportcsv';
import { useFetchDomains } from '../../../../services/domains';
import { useFetchSCKeywords } from '../../../../services/searchConsole';
import SCKeywordsTable from '../../../../components/keywords/SCKeywordsTable';
import { useFetchSettings } from '../../../../services/settings';
import { useFetchKeywords } from '../../../../services/keywords';
import { withAuth } from '../../../../hooks/useAuth';
import { useActiveDomain, useDomainHasScAPI } from '../../../../hooks/useActiveDomain';
import DomainPageLayout from '../../../../components/common/DomainPageLayout';

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
   const [scDateFilter, setSCDateFilter] = useState('thirtyDays');
   const { data: appSettings } = useFetchSettings();
   const appSettingsData: SettingsType = appSettings?.settings || {} as SettingsType;
   const { data: domainsData } = useFetchDomains(router, false);
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];
   const activeDomain = useActiveDomain(router, domainsData);
   const domainHasScAPI = useDomainHasScAPI(activeDomain);
   const scConnected = !!appSettingsData.search_console_integrated;
   const domainsLoaded = !!(domainsData?.domains?.length);
   const { data: keywordsData, isLoading: keywordsLoading, isFetching } = useFetchSCKeywords(
      router,
      domainsLoaded && scConnected,
      domainsLoaded && domainHasScAPI,
      activeDomain?.domain,
   );

   const { keywordsData: trackedKeywordsData } = useFetchKeywords(router, activeDomain?.domain || '');
   const trackedKeywords: KeywordType[] = (trackedKeywordsData?.keywords || []) as KeywordType[];

   const theKeywords: SearchAnalyticsItem[] = useMemo(() => {
      const scData = keywordsData?.data as (SCDomainDataType & Record<string, SearchAnalyticsItem[]>) | undefined;
      return scData && scData[scDateFilter] ? scData[scDateFilter] : [];
   }, [keywordsData, scDateFilter]);

   const theKeywordsGrouped : SearchAnalyticsItem[] = useMemo(() => aggregateSCKeywords(theKeywords), [theKeywords]);

   const isConsoleIntegrated = scConnected || domainHasScAPI;

   return (
      <DomainPageLayout
         activeDomain={activeDomain}
         domains={theDomains}
         appSettings={appSettingsData}
         trackedKeywords={trackedKeywords}
         headerProps={{
            exportCsv: () => exportCSV(theKeywordsGrouped, activeDomain?.domain || '', scDateFilter),
            scFilter: scDateFilter,
            setScFilter: (item:string) => setSCDateFilter(item),
         }}
         renderContent={() => (
            <SCKeywordsTable
            isLoading={keywordsLoading || isFetching}
            domain={activeDomain}
            keywords={theKeywordsGrouped}
            isConsoleIntegrated={isConsoleIntegrated}
            />
         )}
      />
   );
};

export default withAuth(DomainConsolePage);
