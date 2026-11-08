import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAppSettings } from 'utils/appSettings';
import { loadDomains } from 'utils/domainsList';
import { loadDomainKeywords } from 'utils/keywordsList';
import { scraperAllowsCity } from 'utils/keywordMeta';
import { logger } from 'utils/logger';
import { requireSession } from 'utils/serverSession';
import { safeJsonParse } from 'utils/safeJsonParse';
import { normalizeKeyword } from '../_components/keyword-normalize';
import { TrackerView } from './_components/tracker-view';

type PageProps = { params: Promise<{ slug: string }> };

const DEFAULT_COLUMNS = ['Best', 'History', 'Volume', 'Search Console'];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const { slug } = await params;
   return { title: slug };
}

/** null when the read fails, so the browser retries and shows an error if it fails too, instead of an empty list. */
const loadKeywords = async (domain: string): Promise<KeywordType[] | null> => {
   try {
      const { keywords, backfill } = await loadDomainKeywords(domain);
      // Old rows get their 7-day history filled in after the answer, as the API route does.
      setImmediate(backfill);
      return keywords.map(normalizeKeyword);
   } catch (error) {
      logger.error('Loading keywords for the Tracker page', error instanceof Error ? error : new Error(String(error)), { domain });
      return null;
   }
};

export default async function TrackerPage({ params }: PageProps) {
   await requireSession();
   const { slug } = await params;

   const domains = await loadDomains();
   const domain = domains.find((d) => d.slug === slug);
   if (!domain) { notFound(); }

   const [initialKeywords, settings] = await Promise.all([loadKeywords(domain.domain), getAppSettings()]);
   const { scraper_type: globalScraper = '', available_scapers: availableScrapers = [] } = settings;
   const domainScraper = domain.scraper_settings?.scraper_type || null;
   const activeScraper = availableScrapers.find((scraper) => scraper.value === (domainScraper || globalScraper));
   const domainSearchConsole = safeJsonParse<DomainSearchConsole | null>(domain.search_console, null, { context: `domain ${domain.domain} search_console` });
   const domainHasOwnSearchConsole = !!(domainSearchConsole?.client_email && domainSearchConsole?.private_key);

   // Only the values this screen needs are handed to the browser, never the whole settings object.
   return (
      <TrackerView
         domain={domain}
         initialKeywords={initialKeywords}
         initialColumns={settings.keywordsColumns ?? DEFAULT_COLUMNS}
         scraperConfigured={globalScraper !== 'none'}
         searchConsoleConnected={!!settings.search_console_integrated || domainHasOwnSearchConsole}
         allowsCity={scraperAllowsCity(settings, domainScraper)}
         scraperName={activeScraper?.label ?? ''}
         scraperCountries={activeScraper?.scraperCountries}
         availableScrapers={availableScrapers}
         systemScraperType={globalScraper}
      />
   );
}
