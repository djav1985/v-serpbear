import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAppSettings } from 'utils/appSettings';
import { loadDomains } from 'utils/domainsList';
import { requireSession } from 'utils/serverSession';
import { safeJsonParse } from 'utils/safeJsonParse';
import { InsightView } from './_components/insight-view';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
   const { slug } = await params;
   return { title: `${slug} Insight` };
}

export default async function InsightPage({ params }: PageProps) {
   await requireSession();
   const { slug } = await params;

   const domain = (await loadDomains()).find((d) => d.slug === slug);
   if (!domain) { notFound(); }

   const settings = await getAppSettings();
   const domainSearchConsole = safeJsonParse<DomainSearchConsole | null>(domain.search_console, null, { context: `domain ${domain.domain} search_console` });
   const domainHasOwnSearchConsole = !!(domainSearchConsole?.client_email && domainSearchConsole?.private_key);
   const { scraper_type: globalScraper = '', available_scapers: availableScrapers = [] } = settings;

   return (
      <InsightView
         domain={domain}
         searchConsoleConnected={!!settings.search_console_integrated || domainHasOwnSearchConsole}
         availableScrapers={availableScrapers}
         systemScraperType={globalScraper}
      />
   );
}
