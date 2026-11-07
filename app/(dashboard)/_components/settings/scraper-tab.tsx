'use client';

import { Loader2 } from 'lucide-react';
import { SecretInput } from '../secret-input';
import { Button } from 'components/ui/button';
import { Label } from 'components/ui/label';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { Switch } from 'components/ui/switch';
import { useClearFailedQueue, useRetryFailedQueue } from './settings-queries';
import type { SettingsTabProps } from './settings-form';

const FREQUENCY = [
   { label: 'Daily', value: 'daily' }, { label: 'Every Other Day', value: 'other_day' }, { label: 'Weekly', value: 'weekly' },
   { label: 'Monthly', value: 'monthly' }, { label: 'Never', value: 'never' },
];
const DELAY = [
   { label: 'No Delay', value: '0' }, { label: '5 Seconds', value: '5000' }, { label: '10 Seconds', value: '10000' }, { label: '30 Seconds', value: '30000' },
];
const STRATEGY = [
   { label: 'Basic (First page only — 10 results)', value: 'basic' }, { label: 'Custom (Set number of pages)', value: 'custom' },
];
const PAGE_LIMIT = Array.from({ length: 10 }, (_, i) => ({ label: `${i + 1} Page${i > 0 ? 's' : ''}`, value: String(i + 1) }));

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
   return (
      <div className="flex flex-col gap-2">
         <Label>{label}</Label>
         {children}
         {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
   );
}

function Choice({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: { label: string; value: string }[]; label: string }) {
   return (
      <Select value={value} onValueChange={onChange}>
         <SelectTrigger className="w-full" aria-label={label}><SelectValue /></SelectTrigger>
         <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
   );
}

export function ScraperTab({ settings, update, error }: SettingsTabProps) {
   const { mutate: clearFailed, isPending: clearing } = useClearFailedQueue();
   const { mutate: retryFailed, isPending: retrying } = useRetryFailedQueue();
   const scraperOptions = [{ label: 'None', value: 'none' }, ...(settings.available_scapers ?? []).map(({ label, value }) => ({ label, value }))];
   const enabled = settings.scraper_type !== 'none';
   const strategy = settings.scrape_strategy || 'basic';
   const failed = settings.failed_queue ?? [];

   return (
      <div className="flex flex-col gap-5">
         <Field label="Scraping Method">
            <Choice label="Scraping method" value={settings.scraper_type || 'none'} onChange={(v) => update('scraper_type', v)} options={scraperOptions} />
         </Field>
         {enabled && (
            <Field label="Scraper API Key or Token">
               <SecretInput
                  placeholder="API Key/Token"
                  aria-invalid={error?.type === 'no_api_key'}
                  value={settings.scraping_api || ''}
                  onChange={(event) => update('scraping_api', event.target.value)}
               />
            </Field>
         )}
         {enabled && (
            <Field label="Scraping Frequency">
               <Choice label="Scraping frequency" value={settings.scrape_interval || 'daily'} onChange={(v) => update('scrape_interval', v)} options={FREQUENCY} />
            </Field>
         )}
         <Field label="Keyword Scrape Delay">
            <Choice label="Keyword scrape delay" value={settings.scrape_delay || '0'} onChange={(v) => update('scrape_delay', v)} options={DELAY} />
         </Field>
         <div className="flex items-center justify-between gap-3">
            <Label htmlFor="scrape-retry">Auto Retry Failed Keyword Scrape</Label>
            <Switch id="scrape-retry" checked={!!settings.scrape_retry} onCheckedChange={(v) => update('scrape_retry', v)} />
         </div>
         {enabled && (
            <Field
               label="Scrape Strategy"
               hint={strategy === 'basic' ? 'Scrape only the first page (10 results). Fastest, uses least API credits.' : 'Scrape a fixed number of pages per keyword on every refresh.'}
            >
               <Choice label="Scrape strategy" value={strategy} onChange={(v) => update('scrape_strategy', v)} options={STRATEGY} />
            </Field>
         )}
         {enabled && strategy === 'custom' && (
            <Field label="Number of Pages to Scrape" hint="Each page returns up to 10 results. 5 pages = top 50 results checked.">
               <Choice
                  label="Number of pages"
                  value={String(settings.scrape_pagination_limit || 5)}
                  onChange={(v) => update('scrape_pagination_limit', parseInt(v, 10))}
                  options={PAGE_LIMIT}
               />
            </Field>
         )}
         {settings.scrape_retry && failed.length > 0 && (
            <div className="flex flex-col gap-3 border-t pt-4">
               <Button variant="secondary" disabled={clearing} onClick={() => clearFailed()}>
                  {clearing && <Loader2 className="animate-spin" />}Clear Failed Queue ({failed.length} Keywords)
               </Button>
               <Button variant="secondary" disabled={retrying} onClick={() => retryFailed(failed)}>
                  {retrying && <Loader2 className="animate-spin" />}Retry All Failed Now ({failed.length} Keywords)
               </Button>
            </div>
         )}
      </div>
   );
}
