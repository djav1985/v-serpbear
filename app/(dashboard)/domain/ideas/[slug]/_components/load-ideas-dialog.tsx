'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useLoadIdeas } from 'app/(dashboard)/_components/keyword-ideas/ideas-queries';
import { Button } from 'components/ui/button';
import {
   Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from 'components/ui/dialog';
import { Label } from 'components/ui/label';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { Textarea } from 'components/ui/textarea';
import allCountries, { adwordsLanguages } from 'utils/countries';

type LoadIdeasDialogProps = {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   domain: string;
   settings?: { language?: string | number; countries?: string[]; keywords?: string | string[]; seedType?: string };
   searchConsoleConnected: boolean;
   adwordsConnected: boolean;
};

const toText = (value?: string | string[]): string => (Array.isArray(value) ? value.join(',') : (value ?? ''));

/** Loads fresh keyword ideas for a domain from Google Ads. Starts from the settings used last time. */
export function LoadIdeasDialog({ open, onOpenChange, domain, settings, searchConsoleConnected, adwordsConnected }: LoadIdeasDialogProps) {
   // Remount the form each time the dialog opens, so it starts from the stored settings.
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>Load Keyword Ideas from Google Ads</DialogTitle>
               <DialogDescription>Pick what the ideas should be based on.</DialogDescription>
            </DialogHeader>
            {open && (
               <LoadIdeasForm
                  domain={domain}
                  settings={settings}
                  searchConsoleConnected={searchConsoleConnected}
                  adwordsConnected={adwordsConnected}
                  onDone={() => onOpenChange(false)}
               />
            )}
         </DialogContent>
      </Dialog>
   );
}

function LoadIdeasForm({ domain, settings, searchConsoleConnected, adwordsConnected, onDone }: Omit<LoadIdeasDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
   const [seedType, setSeedType] = useState(settings?.seedType || 'auto');
   const [language, setLanguage] = useState(settings?.language ? String(settings.language) : '1000');
   const [country, setCountry] = useState(settings?.countries?.[0] || 'US');
   const [keywords, setKeywords] = useState(toText(settings?.keywords));
   // Keeps the form from being overwritten if the user submits twice quickly.
   const submitting = useRef(false);
   const { mutate: loadIdeas, isPending } = useLoadIdeas(domain);

   const seedOptions = useMemo(() => {
      const options = [{ label: 'Automatically from Website Content', value: 'auto' }];
      if (searchConsoleConnected) { options.push({ label: 'Based on already ranking keywords (GSC)', value: 'searchconsole' }); }
      options.push({ label: 'Based on currently tracked keywords', value: 'tracking' }, { label: 'From Custom Keywords', value: 'custom' });
      return options;
   }, [searchConsoleConnected]);
   const countryOptions = useMemo(() => Object.keys(allCountries)
      .filter((code) => allCountries[code][3] !== 0)
      .map((code) => ({ label: allCountries[code][0], value: code })), []);
   const languageOptions = useMemo(() => Object.entries(adwordsLanguages).map(([value, label]) => ({ label, value })), []);

   const submit = () => {
      if (isPending || submitting.current || !adwordsConnected) { return; }
      let seeds: string[] | undefined;
      if (seedType === 'custom' && keywords) {
         seeds = keywords.split(',').map((key) => key.trim()).filter((key) => key.length > 0);
      } else if (seedType === 'tracking' || seedType === 'searchconsole') {
         // The server fills these in from the tracked keywords or Search Console.
         seeds = [];
      }
      submitting.current = true;
      loadIdeas({ seedType, language, keywords: seeds, country }, {
         onSuccess: onDone,
         onSettled: () => { submitting.current = false; },
      });
   };

   return (
      <>
         <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
               <Label>Get Keyword Ideas</Label>
               <Select value={seedType} onValueChange={setSeedType}>
                  <SelectTrigger className="w-full" aria-label="Get ideas based on"><SelectValue /></SelectTrigger>
                  <SelectContent>{seedOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
               </Select>
            </div>
            {seedType === 'custom' && (
               <div className="flex flex-col gap-2">
                  <Label htmlFor="idea-seeds">Get ideas from given keywords (max 20)</Label>
                  <Textarea id="idea-seeds" placeholder="keyword1, keyword2.." value={keywords} onChange={(event) => setKeywords(event.target.value)} />
               </div>
            )}
            <div className="flex flex-col gap-2">
               <Label>Country</Label>
               <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="w-full" aria-label="Country"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                     {countryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}><span className={`fflag fflag-${o.value} h-[12px] w-[18px] shrink-0`} />{o.label}</SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
            <div className="flex flex-col gap-2">
               <Label>Language</Label>
               <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-full" aria-label="Language"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">{languageOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
               </Select>
            </div>
         </div>
         <DialogFooter>
            <Button
               variant="primaryAction"
               className="w-full"
               disabled={!adwordsConnected || isPending}
               title={!adwordsConnected ? 'Please connect your Google Ads account to generate keyword ideas.' : undefined}
               onClick={submit}
            >
               {isPending ? <Loader2 className="animate-spin" /> : <Download />}
               {isPending ? 'Loading…' : 'Load Keyword Ideas'}
            </Button>
         </DialogFooter>
      </>
   );
}
