'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import { Textarea } from 'components/ui/textarea';
import { cn } from 'lib/utils';
import { SecretInput } from '../secret-input';
import { useRefreshSearchConsole, useTestAdwords, useUpdateAllVolume } from './settings-queries';
import type { SettingsTabProps } from './settings-form';

type Section = 'searchconsole' | 'adwords';

function SearchConsoleSection({ settings, update }: SettingsTabProps) {
   const { mutate: refresh, isPending } = useRefreshSearchConsole();
   return (
      <div className="flex flex-col gap-5">
         <div className="flex flex-col gap-2">
            <Label htmlFor="sc-email">Search Console Client Email</Label>
            <Input id="sc-email" placeholder="myapp@appspot.gserviceaccount.com" value={settings.search_console_client_email || ''} onChange={(event) => update('search_console_client_email', event.target.value)} />
         </div>
         <div className="flex flex-col gap-2">
            <Label htmlFor="sc-key">Search Console Private Key</Label>
            <Textarea id="sc-key" className="h-28 text-xs" placeholder="-----BEGIN PRIVATE KEY-----/ssssaswdkihad...." value={settings.search_console_private_key || ''} onChange={(event) => update('search_console_private_key', event.target.value)} />
         </div>
         <Button variant="secondary" disabled={isPending} onClick={() => refresh()}>
            {isPending && <Loader2 className="animate-spin" />}Refresh Search Console Data
         </Button>
      </div>
   );
}

function AdwordsSection({ settings, update, save }: SettingsTabProps) {
   const {
      adwords_client_id = '', adwords_client_secret = '', adwords_developer_token = '', adwords_account_id = '', adwords_refresh_token = '',
   } = settings;
   const { mutate: testIntegration, isPending: testing } = useTestAdwords();
   const { mutate: updateVolume, isPending: updatingVolume } = useUpdateAllVolume();

   const cloudProjectIntegrated = !!(adwords_client_id && adwords_client_secret && adwords_refresh_token);
   const hasAll = !!(cloudProjectIntegrated && adwords_developer_token && adwords_account_id);

   const authenticate = async () => {
      if (!adwords_client_id || !adwords_client_secret) { return; }
      // A failed or rejected save must not start Google authentication with the old stored credentials.
      if ((await save()) === false) { return; }
      try {
         const response = await fetch('/api/adwords', { method: 'GET', credentials: 'same-origin' });
         const result = await response.json() as { authUrl?: string };
         if (!response.ok || !result.authUrl) { toast.error('Unable to start Google Ads integration.'); return; }
         window.open(result.authUrl, '_blank');
      } catch (_error) {
         toast.error('Unable to start Google Ads integration.');
      }
   };

   return (
      <div className="flex flex-col gap-5">
         <section className="flex flex-col gap-4">
            <h4 className="text-primary font-semibold">Step 1: Connect Google Cloud Project</h4>
            <div className="flex flex-col gap-2">
               <Label>Client ID</Label>
               <SecretInput aria-label="Client ID" placeholder="3943006-231f65cjm.apps.googleusercontent.com" value={adwords_client_id} onChange={(event) => update('adwords_client_id', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
               <Label>Client Secret</Label>
               <SecretInput aria-label="Client Secret" placeholder="GTXSPX-45asaf-u1s252sd6qdE9yc8T" value={adwords_client_secret} onChange={(event) => update('adwords_client_secret', event.target.value)} />
            </div>
            <Button variant="outline" disabled={!adwords_client_id || !adwords_client_secret} title="Insert all the data in the above fields to authenticate" onClick={authenticate}>
               {adwords_refresh_token ? 'Re-Authenticate' : 'Authenticate'} Integration
            </Button>
         </section>

         <section className={cn('flex flex-col gap-4 border-t pt-4', !cloudProjectIntegrated && 'pointer-events-none opacity-40')}>
            <h4 className="text-primary font-semibold">Step 2: Connect Google Ads</h4>
            <div className="flex flex-col gap-2">
               <Label>Developer Token</Label>
               <SecretInput aria-label="Developer Token" placeholder="4xr6jY94kAxtXk4rfcgc4w" value={adwords_developer_token} onChange={(event) => update('adwords_developer_token', event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
               <Label>Test Account ID</Label>
               <SecretInput aria-label="Test Account ID" placeholder="590-948-9101" value={adwords_account_id} onChange={(event) => update('adwords_account_id', event.target.value)} />
            </div>
            <Button
               variant="outline"
               disabled={!hasAll || testing}
               title={hasAll ? undefined : 'Insert all the data in the above fields to test the integration'}
               onClick={() => testIntegration({ developer_token: adwords_developer_token, account_id: adwords_account_id })}
            >
               {testing && <Loader2 className="animate-spin" />}Test Google Ads Integration
            </Button>
         </section>

         <section className={cn('flex flex-col gap-3 border-t pt-4', !hasAll && 'pointer-events-none opacity-40')}>
            <h4 className="text-primary font-semibold">Update Keyword Volume Data</h4>
            <p className="text-sm">Update volume data for all your tracked keywords.</p>
            <Button variant="outline" disabled={!hasAll || updatingVolume} onClick={() => updateVolume()}>
               {updatingVolume && <Loader2 className="animate-spin" />}Update Keywords Volume Data
            </Button>
         </section>

         <p className="text-xs">
            Relevant documentation:{' '}
            <a className="text-primary underline" target="_blank" rel="noreferrer" href="https://docs.serpbear.com/miscellaneous/integrate-google-ads">Integrate Google Ads</a>.
         </p>
      </div>
   );
}

export function IntegrationsTab(props: SettingsTabProps) {
   const [section, setSection] = useState<Section>('searchconsole');
   return (
      <div className="flex flex-col gap-5">
         <div className="flex gap-2" role="tablist" aria-label="Integrations">
            {([['searchconsole', 'Search Console'], ['adwords', 'Google Ads']] as const).map(([value, label]) => (
               <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={section === value}
                  className={cn('rounded-full px-3 py-1.5 text-sm transition-colors', section === value ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-muted')}
                  onClick={() => setSection(value)}
               >
                  {label}
               </button>
            ))}
         </div>
         {section === 'searchconsole' ? <SearchConsoleSection {...props} /> : <AdwordsSection {...props} />}
      </div>
   );
}
