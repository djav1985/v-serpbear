import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAppSettings } from 'utils/appSettings';
import { loadDomainBySlug } from 'utils/domainsList';
import { scraperAllowsCity } from 'utils/keywordMeta';
import { requireSession } from 'utils/serverSession';
import { safeJsonParse } from 'utils/safeJsonParse';
import { TrackerView } from './_components/tracker-view';

type PageProps = { params: Promise<{ slug: string }> };

const DEFAULT_COLUMNS = ['Best', 'History', 'Volume', 'Search Console'];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const { slug } = await params;
   return { title: slug };
}

export default async function TrackerPage({ params }: PageProps) {
   await requireSession();
   const { slug } = await params;

   const [domain, settings] = await Promise.all([loadDomainBySlug(slug), getAppSettings()]);
   if (!domain) { notFound(); }

   const { scraper_type: globalScraper = '', available_scapers: availableScrapers = [] } = settings;
   const domainScraper = domain.scraper_settings?.scraper_type || null;
   const activeScraper = availableScrapers.find((scraper) => scraper.value === (domainScraper || globalScraper));
   const domainSearchConsole = safeJsonParse<DomainSearchConsole | null>(domain.search_console, null, { context: `domain ${domain.domain} search_console` });
   const domainHasOwnSearchConsole = !!(domainSearchConsole?.client_email && domainSearchConsole?.private_key);

   // Only the values this screen needs are handed to the browser, never the whole settings object.
   return (
      <TrackerView
         domain={domain}
         initialColumns={settings.keywordsColumns ?? DEFAULT_COLUMNS}
         scraperConfigured={globalScraper !== 'none'}
         adwordsConnected={Boolean(settings.adwords_refresh_token && settings.adwords_developer_token && settings.adwords_account_id)}
         searchConsoleConnected={!!settings.search_console_integrated || domainHasOwnSearchConsole}
         allowsCity={scraperAllowsCity(settings, domainScraper)}
         scraperName={activeScraper?.label ?? ''}
         scraperCountries={activeScraper?.scraperCountries}
         availableScrapers={availableScrapers}
         systemScraperType={globalScraper}
      />
   );
}
