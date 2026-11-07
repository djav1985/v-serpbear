import type { Metadata } from 'next';
import { getAppSettings } from 'pages/api/settings';
import { parseEnvFlag } from 'utils/dbBooleans';
import { loadDomains } from 'utils/domainsList';
import { logger } from 'utils/logger';
import { requireSession } from 'utils/serverSession';
import { APP_TIMEZONE } from 'utils/timezone';
import { toDomainCardData, type DomainCardData } from './_components/domain-card-data';
import { DomainsView } from './_components/domains-view';

export const metadata: Metadata = { title: 'Domains' };

const loadDomainCards = async (): Promise<DomainCardData[] | null> => {
   try {
      return (await loadDomains(true)).map(toDomainCardData);
   } catch (error) {
      logger.error('Loading domains for the Domains page', error instanceof Error ? error : new Error(String(error)));
      return null;
   }
};

export default async function DomainsPage() {
   await requireSession();

   const [initialDomains, settings] = await Promise.all([loadDomainCards(), getAppSettings()]);
   const { scraper_type = '', available_scapers = [] } = settings;
   const activeScraper = available_scapers.find((scraper) => scraper.value === scraper_type);

   // Only the few values this screen needs are handed to the browser, never the whole settings object.
   return (
      <DomainsView
         initialDomains={initialDomains}
         scraperConfigured={scraper_type !== 'none'}
         searchConsoleIntegrated={!!settings.search_console_integrated}
         showMapPackStat={activeScraper?.supportsMapPack === true}
         screenshotsEnabled={parseEnvFlag(process.env.SCREENSHOTS)}
         timezone={APP_TIMEZONE}
      />
   );
}
