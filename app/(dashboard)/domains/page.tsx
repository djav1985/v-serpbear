import type { Metadata } from 'next';
import { getAppSettings } from 'utils/appSettings';
import { requireSession } from 'utils/serverSession';
import { APP_TIMEZONE } from 'utils/timezone';
import { DomainsView } from './_components/domains-view';

export const metadata: Metadata = { title: 'Domains' };

export default async function DomainsPage() {
   await requireSession();

   const settings = await getAppSettings();
   const { scraper_type = '', available_scapers = [] } = settings;
   const activeScraper = available_scapers.find((scraper) => scraper.value === scraper_type);

   // Only the few values this screen needs are handed to the browser, never the whole settings object.
   return (
      <DomainsView
         scraperConfigured={scraper_type !== 'none'}
         searchConsoleIntegrated={!!settings.search_console_integrated}
         showMapPackStat={activeScraper?.supportsMapPack === true}
         timezone={APP_TIMEZONE}
      />
   );
}
