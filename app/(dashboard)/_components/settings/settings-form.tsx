'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/ui/tabs';
import { IntegrationsTab } from './integrations-tab';
import { NotificationTab } from './notification-tab';
import { ScraperTab } from './scraper-tab';
import { useAppSettings, useSaveSettings } from './settings-queries';

export type SettingsError = { type: string; msg: string };
const ERROR_VISIBLE_MS = 3000;

export type SettingsTabProps = {
   settings: SettingsType;
   update: (key: string, value: string | number | boolean) => void;
   error: SettingsError | null;
   platformName: string;
   /** Saves the current form. Resolves false when validation or the save failed. */
   save: () => Promise<boolean>;
};

const adsFields = (s: SettingsType) => ({
   adwords_client_id: s.adwords_client_id,
   adwords_client_secret: s.adwords_client_secret,
   adwords_refresh_token: s.adwords_refresh_token,
   adwords_developer_token: s.adwords_developer_token,
   adwords_account_id: s.adwords_account_id,
});

const createDefaults = (platformName: string): SettingsType => ({
   scraper_type: 'none',
   scrape_delay: 'none',
   scrape_retry: false,
   notification_interval: 'daily',
   smtp_server: '',
   smtp_port: '',
   smtp_tls_servername: '',
   smtp_username: '',
   smtp_password: '',
   notification_email_from: '',
   notification_email_from_name: platformName,
   search_console_client_email: '',
   search_console_private_key: '',
   keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
});

/** The three settings tabs and the Update button. Mounted only while the sheet is open, so it always starts from the stored settings. */
export function SettingsForm({ platformName }: { platformName: string }) {
   const router = useRouter();
   const { data: stored, isLoading } = useAppSettings(true);
   const { mutateAsync: saveSettings, isPending } = useSaveSettings();
   const [settings, setSettings] = useState<SettingsType>(() => createDefaults(platformName));
   const [error, setError] = useState<SettingsError | null>(null);
   const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

   // Local edits must survive background refetches, so the stored copy is only taken on the first load and after a save.
   const seedPending = useRef(true);
   useEffect(() => {
      if (stored && seedPending.current) { seedPending.current = false; setSettings(stored); }
   }, [stored]);

   // A Google Ads sign-in finishes in another tab and stores its token on the server. Take only the Ads fields, so unsaved edits elsewhere survive.
   const storedToken = stored?.adwords_refresh_token;
   useEffect(() => {
      if (stored && !seedPending.current) { setSettings((current) => ({ ...current, ...adsFields(stored) })); }
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [storedToken]);

   useEffect(() => () => { if (errorTimer.current) { clearTimeout(errorTimer.current); } }, []);

   const update = (key: string, value: string | number | boolean) => setSettings((current) => ({ ...current, [key]: value }));

   const save = async (): Promise<boolean> => {
      const clean: SettingsType = { ...settings };
      Object.entries(clean).forEach(([key, value]) => { if (typeof value === 'string') { (clean as Record<string, unknown>)[key] = value.trim(); } });
      setSettings(clean);

      let problem: SettingsError | null = null;
      // Recipients are set per domain, so only the SMTP details are checked here.
      if (clean.notification_interval !== 'never' && (!clean.smtp_port || !clean.smtp_server || !clean.notification_email_from)) {
         let type = 'no_smtp_from';
         if (!clean.smtp_port) { type = 'no_smtp_port'; }
         if (!clean.smtp_server) { type = 'no_smtp_server'; }
         problem = { type, msg: 'Insert SMTP Server details that will be used to send the emails.' };
      }
      if (clean.scraper_type !== 'none' && !clean.scraping_api) {
         problem = { type: 'no_api_key', msg: 'Insert a Valid API Key or Token for the Scraper Service.' };
      }
      if (problem) {
         if (errorTimer.current) { clearTimeout(errorTimer.current); }
         setError(problem);
         errorTimer.current = setTimeout(() => { setError(null); errorTimer.current = null; }, ERROR_VISIBLE_MS);
         return false;
      }

      // The refresh token is written by the Google callback on the server. Sending this copy back could overwrite a newer
      // token (for example right after re-authorising) with a stale one, so it is left out and the server keeps the stored one.
      const { adwords_refresh_token: _storedToken, ...toSave } = clean;
      try {
         await saveSettings(toSave as SettingsType);
      } catch (_saveError) {
         // The mutation already shows an error toast; keep the local edits.
         return false;
      }
      seedPending.current = true;
      // The pages read the scraper, its city support and the Search Console and Google Ads connections on the server and
      // pass them down, so after any saved change they are read again. Without this the open page keeps the old values.
      router.refresh();
      return true;
   };

   const tabProps: SettingsTabProps = { settings, update, error, platformName, save };

   return (
      <>
         <Tabs defaultValue="scraper" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-4 mb-4 self-start">
               <TabsTrigger value="scraper">Scraper</TabsTrigger>
               <TabsTrigger value="notification">Notification</TabsTrigger>
               <TabsTrigger value="integrations">Integrations</TabsTrigger>
            </TabsList>
            <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-4" data-loading={isLoading}>
               {isLoading && <Loader2 className="text-muted-foreground absolute top-6 left-1/2 size-5 animate-spin" />}
               {!isLoading && (
                  <>
                     <TabsContent value="scraper"><ScraperTab {...tabProps} /></TabsContent>
                     <TabsContent value="notification"><NotificationTab {...tabProps} /></TabsContent>
                     <TabsContent value="integrations"><IntegrationsTab {...tabProps} /></TabsContent>
                  </>
               )}
            </div>
         </Tabs>
         <div className="border-t p-4">
            {error?.msg && <p role="alert" className="bg-destructive/10 text-destructive mb-3 rounded-md p-2 text-center text-sm font-medium">{error.msg}</p>}
            <Button className="w-full" disabled={isPending || isLoading} onClick={() => { save(); }}>
               {isPending && <Loader2 className="animate-spin" />}Update Settings
            </Button>
         </div>
      </>
   );
}
