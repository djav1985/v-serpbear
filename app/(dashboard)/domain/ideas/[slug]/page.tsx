import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAppSettings } from 'utils/appSettings';
import { loadDomainBySlug } from 'utils/domainsList';
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

   const [domain, settings] = await Promise.all([loadDomainBySlug(slug), getAppSettings()]);
   if (!domain) { notFound(); }

   const domainSearchConsole = safeJsonParse<DomainSearchConsole | null>(domain.search_console, null);
   const domainHasOwnSearchConsole = !!(domainSearchConsole?.client_email && domainSearchConsole?.private_key);
   const { scraper_type: globalScraper = '', available_scapers: availableScrapers = [] } = settings;

   // Only the values this screen needs are handed to the browser, never the stored Google Ads tokens.
   return (
      <IdeasView
         domain={domain}
         adwordsConnected={Boolean(settings.adwords_refresh_token && settings.adwords_developer_token && settings.adwords_account_id)}
         searchConsoleConnected={!!settings.search_console_integrated || domainHasOwnSearchConsole}
         availableScrapers={availableScrapers}
         systemScraperType={globalScraper}
      />
   );
}
