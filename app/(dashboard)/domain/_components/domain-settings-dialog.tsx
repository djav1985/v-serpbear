'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { SecretInput } from 'app/(dashboard)/_components/secret-input';
import { Button } from 'components/ui/button';
import {
   Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { Switch } from 'components/ui/switch';
import {
   Tabs, TabsContent, TabsList, TabsTrigger,
} from 'components/ui/tabs';
import { Textarea } from 'components/ui/textarea';
import { isValidEmail } from 'utils/client/validators';
import { safeJsonParse } from 'utils/safeJsonParse';
import { useDeleteDomain, useDomain, useUpdateDomain } from './domain-queries';

type Scraper = NonNullable<SettingsType['available_scapers']>[number];

type DomainSettingsDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   domain: DomainType;
   availableScrapers?: Scraper[];
   systemScraperType?: string;
};

type Tab = 'notification' | 'searchconsole' | 'scraper';
type FormError = { type: string; msg: string };

const SYSTEM_SCRAPER = '__system__';
const GLOBAL_STRATEGY = '__global__';
const ERROR_VISIBLE_MS = 3000;

// The server sends this marker in place of a saved Search Console credential and keeps the stored value when it is sent back.
const SAVED_CREDENTIAL_MARKER = 'true';
const SAVED_CREDENTIAL_PLACEHOLDER = 'Saved. Type a new value to replace it.';
const isSavedCredential = (value?: string | null): boolean => value === SAVED_CREDENTIAL_MARKER;

const DEFAULT_SEARCH_CONSOLE: DomainSearchConsole = { property_type: 'domain', url: '', client_email: '', private_key: '' };

const parseSearchConsole = (raw?: string | null): DomainSearchConsole => {
   const parsed = safeJsonParse<DomainSearchConsole | null>(raw, null, { context: 'domain search_console settings' });
   return parsed && typeof parsed === 'object' ? { ...DEFAULT_SEARCH_CONSOLE, ...parsed } : { ...DEFAULT_SEARCH_CONSOLE };
};

const resolveError = (settings: DomainSettings, hasStoredKey: boolean): FormError | null => {
   if (settings.notification_emails) {
      const invalid = settings.notification_emails.split(',').map((email) => email.trim()).filter(Boolean).find((email) => !isValidEmail(email));
      if (invalid) { return { type: 'email', msg: 'Invalid Email' }; }
   }
   if (settings.scraper_settings?.scraper_type) {
      const hasInput = typeof settings.scraper_settings.scraping_api === 'string' && settings.scraper_settings.scraping_api.trim().length > 0;
      // "Remove stored key" leaves the field blank on purpose: the save sends clear_api_key.
      const isClearing = settings.scraper_settings.clear_api_key === true;
      if (!hasInput && !hasStoredKey && !isClearing) { return { type: 'scraper', msg: 'API key is required for the selected scraper.' }; }
   }
   return null;
};

const buildInitialSettings = (domain: DomainType): DomainSettings => ({
   notification_emails: domain.notification_emails ?? '',
   search_console: parseSearchConsole(domain.search_console),
   scrapeEnabled: Boolean(domain.scrapeEnabled),
   scraper_settings: {
      scraper_type: domain.scraper_settings?.scraper_type ?? null,
      has_api_key: domain.scraper_settings?.has_api_key ?? false,
      scraping_api: '',
   },
   business_name: domain.business_name ?? '',
   scrape_strategy: (domain.scrape_strategy as ScrapeStrategy | '' | undefined) ?? '',
   scrape_pagination_limit: domain.scrape_pagination_limit ?? 0,
});

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
   return (
      <div className="flex flex-col gap-2">
         <Label htmlFor={htmlFor}>{label}</Label>
         {children}
         {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
   );
}

/**
 * Every time the dialog opens it starts from the stored settings. The form lives in an inner component that is remounted on
 * each opening, so changes abandoned by closing the dialog can never be saved with a later edit.
 */
export function DomainSettingsDialog(props: DomainSettingsDialogProps) {
   const [wasOpen, setWasOpen] = useState(props.open);
   const [opening, setOpening] = useState(0);
   if (props.open !== wasOpen) {
      setWasOpen(props.open);
      if (props.open) { setOpening((count) => count + 1); }
   }
   return <DomainSettingsForm key={opening} {...props} />;
}

function DomainSettingsForm({ open, onOpenChange, domain, availableScrapers = [], systemScraperType = '' }: DomainSettingsDialogProps) {
   const router = useRouter();
   const [tab, setTab] = useState<Tab>('notification');
   const [settings, setSettings] = useState<DomainSettings>(() => buildInitialSettings(domain));
   const [formError, setFormError] = useState<FormError>({ type: '', msg: '' });
   const [confirmRemove, setConfirmRemove] = useState(false);
   const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const seededFor = useRef<string | null>(null);

   useEffect(() => () => { if (errorTimer.current) { clearTimeout(errorTimer.current); } }, []);

   // The list masks Search Console and scraper details, so load the full domain once per domain and seed the form
   // from it. A background refetch never overwrites what the user has typed.
   const domainQuery = useDomain(domain.domain, open);
   useEffect(() => {
      const full = domainQuery.data;
      if (!full || seededFor.current === full.domain) { return; }
      seededFor.current = full.domain;
      setSettings((previous) => ({
         ...previous,
         search_console: parseSearchConsole(full.search_console),
         scrapeEnabled: Boolean(full.scrapeEnabled),
         scraper_settings: {
            scraper_type: full.scraper_settings?.scraper_type ?? null,
            scraping_api: previous.scraper_settings?.scraping_api ?? '',
            has_api_key: full.scraper_settings?.has_api_key ?? false,
         },
         business_name: full.business_name ?? previous.business_name ?? '',
      }));
   }, [domainQuery.data]);

   const close = (next: boolean) => { onOpenChange(next); if (!next) { setConfirmRemove(false); } };
   const updateMutation = useUpdateDomain(() => { close(false); router.refresh(); });
   const deleteMutation = useDeleteDomain(() => { close(false); router.push('/domains'); router.refresh(); });

   const scraperOptions = useMemo(() => [{ label: 'System Scraper', value: SYSTEM_SCRAPER }, ...availableScrapers.map((s) => ({ label: s.label, value: s.value }))], [availableScrapers]);
   const scraperType = settings.scraper_settings?.scraper_type || null;
   const hasOverride = Boolean(scraperType);
   const hasStoredKey = settings.scraper_settings?.has_api_key === true;
   const keyInput = settings.scraper_settings?.scraping_api ?? '';
   const systemScraperLabel = availableScrapers.find((s) => s.value === systemScraperType)?.label || systemScraperType;
   const sc = settings.search_console ?? DEFAULT_SEARCH_CONSOLE;

   // Saving before the stored settings load would send the list's masked placeholders back.
   const isLoadingDomain = domainQuery.isLoading || domainQuery.isError;

   const showError = (error: FormError) => {
      if (errorTimer.current) { clearTimeout(errorTimer.current); }
      setFormError(error);
      if (error.type === 'scraper') { setTab('scraper'); }
      errorTimer.current = setTimeout(() => { setFormError({ type: '', msg: '' }); errorTimer.current = null; }, ERROR_VISIBLE_MS);
   };

   const setScraper = (value: string) => {
      const nextType = value === SYSTEM_SCRAPER ? null : value;
      setSettings((previous) => {
         const prev = previous.scraper_settings || { scraper_type: null, scraping_api: '', has_api_key: false };
         const keep = prev.scraper_type === nextType;
         return { ...previous, scraper_settings: { scraper_type: nextType, scraping_api: keep ? prev.scraping_api ?? '' : '', has_api_key: keep ? prev.has_api_key === true : false } };
      });
   };

   const buildPayload = (): Partial<DomainSettings> => {
      const { scraper_settings: scraper, business_name: businessName, scrape_strategy: strategy, scrape_pagination_limit: pages, ...rest } = settings;
      const payload: Partial<DomainSettings> = { ...rest };
      payload.business_name = (businessName || '').trim() || null;
      payload.scrape_strategy = strategy || '';
      payload.scrape_pagination_limit = pages || 0;
      if (scraper) {
         const type = typeof scraper.scraper_type === 'string' && scraper.scraper_type ? scraper.scraper_type : null;
         if (!type) {
            payload.scraper_settings = { scraper_type: null };
         } else {
            const next: DomainScraperSettings = { scraper_type: type };
            const key = (scraper.scraping_api || '').trim();
            if (key) { next.scraping_api = key; }
            if (!key && scraper.clear_api_key) { next.clear_api_key = true; }
            payload.scraper_settings = next;
         }
      }
      return payload;
   };

   const save = () => {
      if (isLoadingDomain || updateMutation.isPending) { return; }
      const error = resolveError(settings, hasStoredKey);
      if (error) { showError(error); return; }
      updateMutation.mutate({ domain: domain.domain, settings: buildPayload() });
   };

   return (
      <>
         <Dialog open={open} onOpenChange={close}>
            <DialogContent className="h-[95dvh] min-h-0 max-h-[95dvh] grid-rows-[auto_1fr_auto] overflow-x-hidden overflow-y-auto sm:h-[min(42rem,90vh)] sm:min-h-[min(42rem,90vh)] sm:max-h-[90vh] sm:max-w-lg" data-testid="domain_settings">
               <DialogHeader>
                  <DialogTitle>Domain settings</DialogTitle>
                  <DialogDescription>{domain.domain}</DialogDescription>
               </DialogHeader>

               <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
                  <TabsList className="settings-tabs-list w-full">
                     <TabsTrigger value="notification" className="settings-tabs-trigger">Notification</TabsTrigger>
                     <TabsTrigger value="searchconsole" className="settings-tabs-trigger">Search Console</TabsTrigger>
                     <TabsTrigger value="scraper" className="settings-tabs-trigger">Scraper</TabsTrigger>
                  </TabsList>

                  <TabsContent value="notification" className="mt-4 flex flex-col gap-4 animate-in fade-in-0 slide-in-from-right-4 duration-1000">
                     <Field label="Notification emails" htmlFor="ds-emails" hint="Leave blank to turn off notification emails for this domain.">
                        <Input
                           id="ds-emails"
                           placeholder="Your emails"
                           aria-invalid={formError.type === 'email'}
                           value={settings.notification_emails || ''}
                           onChange={(event) => setSettings({ ...settings, notification_emails: event.target.value })}
                        />
                     </Field>
                  </TabsContent>

                  <TabsContent value="searchconsole" className="mt-4 flex flex-col gap-4 animate-in fade-in-0 slide-in-from-right-4 duration-1000">
                     <Field label="Property type">
                        <Select value={sc.property_type || 'domain'} onValueChange={(value) => setSettings({ ...settings, search_console: { ...sc, property_type: value as 'domain' | 'url' } })}>
                           <SelectTrigger className="w-full" aria-label="Property type"><SelectValue /></SelectTrigger>
                           <SelectContent>
                              <SelectItem value="domain">Domain</SelectItem>
                              <SelectItem value="url">URL</SelectItem>
                           </SelectContent>
                        </Select>
                     </Field>
                     {sc.property_type === 'url' && (
                        <Field label="Property URL (required)" htmlFor="ds-sc-url">
                           <Input id="ds-sc-url" placeholder="https://mywebsite.com/" value={sc.url || ''} onChange={(event) => setSettings({ ...settings, search_console: { ...sc, url: event.target.value } })} />
                        </Field>
                     )}
                     <Field label="Search Console client email" htmlFor="ds-sc-email">
                        <Input
                           id="ds-sc-email"
                           placeholder={isSavedCredential(sc.client_email) ? SAVED_CREDENTIAL_PLACEHOLDER : 'myapp@appspot.gserviceaccount.com'}
                           value={isSavedCredential(sc.client_email) ? '' : (sc.client_email || '')}
                           onChange={(event) => setSettings({ ...settings, search_console: { ...sc, client_email: event.target.value } })}
                        />
                     </Field>
                     <Field label="Search Console private key" htmlFor="ds-sc-key">
                        <Textarea
                           id="ds-sc-key"
                           className="h-28 text-xs"
                           placeholder={isSavedCredential(sc.private_key) ? SAVED_CREDENTIAL_PLACEHOLDER : '-----BEGIN PRIVATE KEY-----'}
                           value={isSavedCredential(sc.private_key) ? '' : (sc.private_key || '')}
                           onChange={(event) => setSettings({ ...settings, search_console: { ...sc, private_key: event.target.value } })}
                        />
                     </Field>
                  </TabsContent>

                  <TabsContent value="scraper" className="mt-4 flex flex-col gap-4 animate-in fade-in-0 slide-in-from-right-4 duration-1000">
                     <label className="flex items-center justify-between gap-3 text-sm font-medium">
                        <span>{settings.scrapeEnabled ? 'Active' : 'Deactive'}</span>
                        <Switch checked={Boolean(settings.scrapeEnabled)} aria-label="Toggle domain active status" onCheckedChange={(next) => setSettings({ ...settings, scrapeEnabled: next })} />
                     </label>

                     <Field label="Scraper">
                        <Select value={scraperType ?? SYSTEM_SCRAPER} onValueChange={setScraper}>
                           <SelectTrigger className="w-full" aria-label="Scraper"><SelectValue /></SelectTrigger>
                           <SelectContent>{scraperOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                        </Select>
                     </Field>

                     <Field label="API key" htmlFor="ds-api-key">
                        <SecretInput
                           id="ds-api-key"
                           disabled={!hasOverride}
                           aria-invalid={formError.type === 'scraper'}
                           placeholder={hasStoredKey ? 'API key stored (leave blank to keep existing)' : 'Enter API key'}
                           value={keyInput}
                           onChange={(event) => setSettings({ ...settings, scraper_settings: { ...(settings.scraper_settings || { scraper_type: null }), scraping_api: event.target.value } })}
                        />
                        {!hasOverride && systemScraperLabel && <p className="text-muted-foreground text-xs">Using system scraper: {systemScraperLabel}</p>}
                        {hasOverride && hasStoredKey && !keyInput && (
                           <>
                              <p className="text-muted-foreground text-xs">An API key is already stored for this domain.</p>
                              <button
                                 type="button"
                                 className="text-destructive self-start text-xs font-semibold"
                                 onClick={() => setSettings({ ...settings, scraper_settings: { ...(settings.scraper_settings || { scraper_type: null }), scraping_api: '', has_api_key: false, clear_api_key: true } })}
                              >
                                 Remove stored key
                              </button>
                           </>
                        )}
                        {hasOverride && !hasStoredKey && settings.scraper_settings?.clear_api_key && !keyInput && (
                           <p className="text-muted-foreground text-xs">The stored key will be removed when you save. Enter a new key or switch to the system scraper.</p>
                        )}
                     </Field>

                     <Field label="Business name (optional)" htmlFor="ds-business">
                        <Input id="ds-business" placeholder="e.g., Vontainment" value={settings.business_name || ''} onChange={(event) => setSettings({ ...settings, business_name: event.target.value })} />
                     </Field>

                     <Field label="Scrape strategy override">
                        <Select value={settings.scrape_strategy || GLOBAL_STRATEGY} onValueChange={(value) => setSettings({ ...settings, scrape_strategy: (value === GLOBAL_STRATEGY ? '' : value) as ScrapeStrategy | '' })}>
                           <SelectTrigger className="w-full" aria-label="Scrape strategy"><SelectValue /></SelectTrigger>
                           <SelectContent>
                              <SelectItem value={GLOBAL_STRATEGY}>Use Global Setting</SelectItem>
                              <SelectItem value="basic">Basic (First page only)</SelectItem>
                              <SelectItem value="custom">Custom (Set number of pages)</SelectItem>
                           </SelectContent>
                        </Select>
                     </Field>
                     {settings.scrape_strategy === 'custom' && (
                        <Field label="Number of pages to scrape">
                           <Select value={String(settings.scrape_pagination_limit || 0)} onValueChange={(value) => setSettings({ ...settings, scrape_pagination_limit: parseInt(value, 10) })}>
                              <SelectTrigger className="w-full" aria-label="Pages to scrape"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                 <SelectItem value="0">Global default</SelectItem>
                                 {Array.from({ length: 10 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{`${i + 1} Page${i > 0 ? 's' : ''}`}</SelectItem>)}
                              </SelectContent>
                           </Select>
                        </Field>
                     )}
                  </TabsContent>
               </Tabs>

               {!updateMutation.isPending && formError.msg && <p role="alert" className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{formError.msg}</p>}

               <DialogFooter className="sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                     <Trash2 />Remove Domain
                  </Button>
                  <Button variant="primaryAction" disabled={isLoadingDomain || updateMutation.isPending} onClick={save}>
                     {isLoadingDomain ? 'Loading…' : updateMutation.isPending ? 'Saving…' : 'Update Settings'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Remove domain {domain.domain}</DialogTitle>
                  <DialogDescription>Are you sure you want to remove this domain? Removing this domain will remove all its keywords.</DialogDescription>
               </DialogHeader>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                  <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(domain.domain)}>
                     {deleteMutation.isPending ? 'Removing…' : 'Remove'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}
