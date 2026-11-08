'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Monitor, Smartphone } from 'lucide-react';
import { Button } from 'components/ui/button';
import {
   Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import { Input } from 'components/ui/input';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { Textarea } from 'components/ui/textarea';
import { cn } from 'lib/utils';
import countries from 'utils/countries';
import { getDomainTags } from 'utils/keywordMeta';
import { buildStoredLocation, hasValidCityStatePair } from 'utils/location';
import { useAddKeywords } from './keyword-queries';
import { TagInput } from './tag-input';

type AddKeywordsDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   domain: string;
   /** The keywords already tracked, used to skip duplicates and to suggest tags. */
   keywords: KeywordType[];
   scraperName: string;
   allowsCity: boolean;
   scraperCountries?: string[];
};

type Device = 'desktop' | 'mobile';
const ERROR_VISIBLE_MS = 3000;
const DEFAULT_COUNTRY_KEY = 'default_country';

const readDefaultCountry = (): string => {
   try { return window.localStorage.getItem(DEFAULT_COUNTRY_KEY) || 'US'; } catch (_error) { return 'US'; }
};

export function AddKeywordsDialog({
   open, onOpenChange, domain, keywords, scraperName, allowsCity, scraperCountries,
}: AddKeywordsDialogProps) {
   const [text, setText] = useState('');
   const [devices, setDevices] = useState<Device[]>(['desktop']);
   const [country, setCountry] = useState('US');
   const [tags, setTags] = useState('');
   const [city, setCity] = useState('');
   const [state, setState] = useState('');
   const [error, setError] = useState('');
   const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

   useEffect(() => () => { if (errorTimer.current) { clearTimeout(errorTimer.current); } }, []);
   // Start from the country last used on this device.
   useEffect(() => { if (open) { setCountry(readDefaultCountry()); } }, [open]);

   const showError = (message: string) => {
      if (errorTimer.current) { clearTimeout(errorTimer.current); }
      setError(message);
      errorTimer.current = setTimeout(() => { setError(''); errorTimer.current = null; }, ERROR_VISIBLE_MS);
   };

   const close = (next: boolean) => {
      onOpenChange(next);
      if (!next) { setText(''); setTags(''); setCity(''); setState(''); setError(''); setDevices(['desktop']); }
   };

   const { mutate, isPending } = useAddKeywords(() => close(false));

   // Countries the scraper can target. Without a list, any country that has a Google domain.
   const countryOptions = useMemo(() => Object.keys(countries)
      .filter((code) => countries[code] && (scraperCountries && scraperCountries.length > 0 ? scraperCountries.includes(code) : countries[code][4] !== null))
      .map((code) => ({ label: countries[code][0], value: code })), [scraperCountries]);
   const existingTags = useMemo(() => getDomainTags(keywords), [keywords]);

   const toggleDevice = (device: Device) => {
      setDevices((current) => {
         if (!current.includes(device)) { return [...current, device]; }
         // Keep at least one device so a keyword is never saved without one.
         return current.length === 1 ? current : current.filter((d) => d !== device);
      });
   };

   const submit = () => {
      const list = [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];
      if (list.length === 0) { showError('Please insert a keyword'); return; }

      const trimmedCity = city.trim();
      const trimmedState = state.trim();
      if (!hasValidCityStatePair(trimmedCity, trimmedState)) { showError('City and state must be provided together.'); return; }

      // Stored as "City,State,Country Name"; a country-only keyword stores a blank location.
      const location = allowsCity ? buildStoredLocation({ city: trimmedCity, state: trimmedState, countryCode: country }) : '';
      const tracked = new Set(keywords.map((k) => `${k.keyword}-${k.device}-${k.location || k.country}`));
      const idFor = (keyword: string, device: string) => `${keyword}-${device}-${location || country}`;

      const alreadyTracked = list.filter((keyword) => devices.some((device) => tracked.has(idFor(keyword, device))));
      // Only block when every submitted keyword already exists on a single device; otherwise duplicates are skipped below.
      if (devices.length === 1 && alreadyTracked.length > 0 && alreadyTracked.length === list.length) {
         showError(`Keywords ${alreadyTracked.join(',')} already exist`);
         return;
      }

      const skipped: string[] = [];
      const payloads = list.flatMap((keyword) => devices
         .filter((device) => {
            if (tracked.has(idFor(keyword, device))) { skipped.push(`${keyword} (${device})`); return false; }
            return true;
         })
         .map((device) => ({ keyword, device, country, domain, tags, location })));
      mutate({ payloads, skipped });
   };

   const noCityTitle = !allowsCity ? `Your scraper ${scraperName} doesn't have city level scraping feature.` : '';

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent className="sm:max-w-md" data-testid="addkeywords_modal">
            <DialogHeader>
               <DialogTitle>Add new keywords</DialogTitle>
               <DialogDescription>Put each keyword on its own line.</DialogDescription>
            </DialogHeader>

            <Textarea
               className="h-40"
               aria-label="Keywords"
               placeholder="Type or paste keywords here. Insert each keyword in a new line."
               value={text}
               onChange={(event) => setText(event.target.value)}
            />

            <div className="flex items-center justify-between gap-3">
               <Select
                  value={country}
                  onValueChange={(next) => {
                     setCountry(next);
                     try { window.localStorage.setItem(DEFAULT_COUNTRY_KEY, next); } catch (_error) { /* storage blocked */ }
                  }}
               >
                  <SelectTrigger className="min-w-0 flex-1" aria-label="Country"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                     {countryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                           <span className={`fflag fflag-${option.value} h-[12px] w-[18px] shrink-0`} />{option.label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <div className="flex gap-1" role="group" aria-label="Devices">
                  {([['desktop', Monitor, 'Desktop'], ['mobile', Smartphone, 'Mobile']] as const).map(([device, Icon, label]) => (
                     <button
                        key={device}
                        type="button"
                        aria-pressed={devices.includes(device)}
                        className={cn(
                           'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium',
                           devices.includes(device) ? 'bg-accent text-accent-foreground border-primary/30' : 'text-muted-foreground',
                        )}
                        onClick={() => toggleDevice(device)}
                     >
                        <Icon className="size-4" /><span className="hidden sm:inline">{label}</span>
                        <Check className={cn('size-3', !devices.includes(device) && 'opacity-30')} />
                     </button>
                  ))}
               </div>
            </div>

            <TagInput value={tags} onChange={setTags} existingTags={existingTags} placeholder="Insert tags (optional)" />
            <Input disabled={!allowsCity} title={noCityTitle} aria-label="State" placeholder={allowsCity ? 'State (optional)' : 'N/A'} value={state} onChange={(event) => setState(event.target.value)} />
            <Input disabled={!allowsCity} title={noCityTitle} aria-label="City" placeholder={allowsCity ? 'City (optional)' : 'N/A'} value={city} onChange={(event) => setCity(event.target.value)} />

            {error && <p role="alert" className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</p>}

            <DialogFooter>
               <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
               <Button disabled={isPending} onClick={() => { if (!isPending) { submit(); } }}>{isPending ? 'Adding…' : 'Add Keywords'}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
