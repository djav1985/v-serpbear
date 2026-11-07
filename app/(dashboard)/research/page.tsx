import type { Metadata } from 'next';
import { getAppSettings } from 'pages/api/settings';
import { scraperAllowsCity } from 'utils/keywordMeta';
import { requireSession } from 'utils/serverSession';
import { ResearchView } from './_components/research-view';

export const metadata: Metadata = { title: 'Research Keywords' };

export default async function ResearchPage() {
   await requireSession();
   const settings = await getAppSettings();

   // Only these two facts reach the browser, never the stored Google Ads tokens.
   const adwordsConnected = Boolean(settings.adwords_refresh_token && settings.adwords_developer_token && settings.adwords_account_id);
   return <ResearchView adwordsConnected={adwordsConnected} allowsCity={scraperAllowsCity(settings)} />;
}
