import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAppSettings } from 'utils/appSettings';
import { loadDomains } from 'utils/domainsList';
import { scraperAllowsCity } from 'utils/keywordMeta';
import { requireSession } from 'utils/serverSession';
import { safeJsonParse } from 'utils/safeJsonParse';
import { IdeasView } from './_components/ideas-view';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const { slug } = await params;
   return { title: `${slug} Keyword Ideas` };
}

export default async function DomainIdeasPage({ params }: PageProps) {
   await requireSession();
   const { slug } = await params;

   const domain = (await loadDomains()).find((d) => d.slug === slug);
   if (!domain) { notFound(); }

   const settings = await getAppSettings();
   const domainSearchConsole = safeJsonParse<DomainSearchConsole | null>(domain.search_console, null);
   const domainHasOwnSearchConsole = !!(domainSearchConsole?.client_email && domainSearchConsole?.private_key);
   const domainScraper = domain.scraper_settings?.scraper_type || null;
   const { scraper_type: globalScraper = '', available_scapers: availableScrapers = [] } = settings;

   // Only the values this screen needs are handed to the browser, never the stored Google Ads tokens.
   return (
      <IdeasView
         domain={domain}
         adwordsConnected={Boolean(settings.adwords_refresh_token && settings.adwords_developer_token && settings.adwords_account_id)}
         searchConsoleConnected={!!settings.search_console_integrated || domainHasOwnSearchConsole}
         allowsCity={scraperAllowsCity(settings, domainScraper)}
         availableScrapers={availableScrapers}
         systemScraperType={globalScraper}
      />
   );
}
