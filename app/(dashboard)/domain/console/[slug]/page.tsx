import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAppSettings } from 'utils/appSettings';
import { loadDomainBySlug } from 'utils/domainsList';
import { requireSession } from 'utils/serverSession';
import { safeJsonParse } from 'utils/safeJsonParse';
import { DiscoverView } from './_components/discover-view';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const { slug } = await params;
   return { title: `${slug} Discover` };
}

export default async function DiscoverPage({ params }: PageProps) {
   await requireSession();
   const { slug } = await params;

   const [domain, settings] = await Promise.all([loadDomainBySlug(slug), getAppSettings()]);
   if (!domain) { notFound(); }

   const domainSearchConsole = safeJsonParse<DomainSearchConsole | null>(domain.search_console, null);
   const domainHasOwnSearchConsole = !!(domainSearchConsole?.client_email && domainSearchConsole?.private_key);
   const { scraper_type: globalScraper = '', available_scapers: availableScrapers = [] } = settings;

   return (
      <DiscoverView
         domain={domain}
         searchConsoleConnected={!!settings.search_console_integrated || domainHasOwnSearchConsole}
         adwordsConnected={Boolean(settings.adwords_refresh_token && settings.adwords_developer_token && settings.adwords_account_id)}
         availableScrapers={availableScrapers}
         systemScraperType={globalScraper}
      />
   );
}
