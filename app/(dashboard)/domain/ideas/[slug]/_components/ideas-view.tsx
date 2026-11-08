'use client';

import { useMemo, useState } from 'react';
import { useShell } from 'app/(dashboard)/_components/shell-context';
import { IdeasTable } from 'app/(dashboard)/_components/keyword-ideas/ideas-table';
import { useIdeas } from 'app/(dashboard)/_components/keyword-ideas/ideas-queries';
import { exportKeywordIdeas } from 'utils/client/exportcsv';
import { DomainHeader } from '../../../_components/domain-header';
import { DomainSettingsDialog } from '../../../_components/domain-settings-dialog';
import { LoadIdeasDialog } from './load-ideas-dialog';

type Scraper = NonNullable<SettingsType['available_scapers']>[number];

type IdeasViewProps = {
   domain: DomainType;
   adwordsConnected: boolean;
   searchConsoleConnected: boolean;
   allowsCity: boolean;
   availableScrapers: Scraper[];
   systemScraperType: string;
};

export function IdeasView({ domain, adwordsConnected, searchConsoleConnected, allowsCity, availableScrapers, systemScraperType }: IdeasViewProps) {
   const { domains } = useShell();
   const [showFavorites, setShowFavorites] = useState(false);
   const [loadOpen, setLoadOpen] = useState(false);
   const [settingsOpen, setSettingsOpen] = useState(false);

   const { data, isLoading, isError } = useIdeas(domain.domain, adwordsConnected);
   const ideas = useMemo(() => data?.data?.keywords ?? [], [data]);
   const favorites = useMemo(() => data?.data?.favorites ?? [], [data]);

   return (
      <div className="flex flex-col gap-4">
         <DomainHeader
            domain={domain}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={() => exportKeywordIdeas(showFavorites ? favorites : ideas, domain.domain)}
            onLoadIdeas={() => setLoadOpen(true)}
         />
         <IdeasTable
            domain={domain.domain}
            ideas={ideas}
            favorites={favorites}
            isLoading={isLoading}
            noIdeasDatabase={isError}
            adwordsConnected={adwordsConnected}
            showFavorites={showFavorites}
            onShowFavorites={setShowFavorites}
            domains={domains}
            allowsCity={allowsCity}
         />
         <LoadIdeasDialog
            open={loadOpen}
            onOpenChange={setLoadOpen}
            domain={domain.domain}
            settings={data?.data?.settings}
            searchConsoleConnected={searchConsoleConnected}
            adwordsConnected={adwordsConnected}
         />
         <DomainSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            domain={domain}
            availableScrapers={availableScrapers}
            systemScraperType={systemScraperType}
         />
      </div>
   );
}
