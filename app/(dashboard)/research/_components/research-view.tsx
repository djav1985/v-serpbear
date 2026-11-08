'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useShell } from 'app/(dashboard)/_components/shell-context';
import { IdeasTable } from 'app/(dashboard)/_components/keyword-ideas/ideas-table';
import { useIdeas, useLoadIdeas } from 'app/(dashboard)/_components/keyword-ideas/ideas-queries';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';
import { Label } from 'components/ui/label';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { Textarea } from 'components/ui/textarea';
import { exportKeywordIdeas } from 'utils/client/exportcsv';
import allCountries, { adwordsLanguages } from 'utils/countries';

// Matches the "Max 20" label next to the seed keywords field.
const MAX_SEED_KEYWORDS = 20;

type ResearchViewProps = {
   adwordsConnected: boolean;
   allowsCity: boolean;
};

export function ResearchView({ adwordsConnected, allowsCity }: ResearchViewProps) {
   const { domains } = useShell();
   const [showFavorites, setShowFavorites] = useState(false);
   const [language, setLanguage] = useState('1000');
   const [country, setCountry] = useState('US');
   const [seedKeywords, setSeedKeywords] = useState('');

   const { data, isLoading, isError } = useIdeas(null, adwordsConnected);
   const { mutate: loadIdeas, isPending: isLoadingIdeas } = useLoadIdeas(null);

   const ideas = useMemo(() => data?.data?.keywords ?? [], [data]);
   const favorites = useMemo(() => data?.data?.favorites ?? [], [data]);
   const previous = data?.data?.settings;

   // Start the form from what was used for the stored ideas.
   const previousCountry = previous?.country;
   const previousLanguage = previous?.language;
   const previousSeeds = previous?.keywords;
   useEffect(() => {
      if (previousCountry) { setCountry(previousCountry); }
      if (previousLanguage) { setLanguage(previousLanguage.toString()); }
      if (previousSeeds) { setSeedKeywords(previousSeeds.join(',')); }
   }, [previousCountry, previousLanguage, previousSeeds]);

   const countryOptions = useMemo(() => Object.keys(allCountries)
      .filter((code) => allCountries[code][3] !== 0)
      .map((code) => ({ label: allCountries[code][0], value: code })), []);
   const languageOptions = useMemo(() => Object.entries(adwordsLanguages).map(([value, label]) => ({ label, value })), []);

   const submit = () => {
      if (isLoadingIdeas || !adwordsConnected) { return; }
      // Trim, drop empties, dedupe and cap at 20 seeds, the limit shown in the form.
      const seeds = [...new Set(seedKeywords.split(',').map((key) => key.trim()).filter((key) => key.length > 0))].slice(0, MAX_SEED_KEYWORDS);
      loadIdeas({ seedType: 'custom', language, keywords: seeds.length > 0 ? seeds : undefined, country });
   };

   const exportable = showFavorites ? favorites : ideas;

   return (
      <div className="flex flex-col gap-4">
         <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold" data-testid="domain-header">Research Keywords</h1>
            <Button variant="ghost" size="sm" data-testid="export_csv" disabled={exportable.length === 0} onClick={() => exportKeywordIdeas(exportable, 'research')}>
               <Download />Export CSV
            </Button>
         </div>

         <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <Card data-testid="sidebar">
               <CardHeader><CardTitle className="text-base">Generate ideas</CardTitle></CardHeader>
               <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                     <Label htmlFor="research-seeds">Generate ideas from given keywords (max {MAX_SEED_KEYWORDS})</Label>
                     <Textarea id="research-seeds" className="h-28" placeholder="keyword1, keyword2.." value={seedKeywords} onChange={(event) => setSeedKeywords(event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                     <Label>Country</Label>
                     <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger className="w-full" aria-label="Country"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-72">
                           {countryOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                 <span className={`fflag fflag-${option.value} h-[12px] w-[18px] shrink-0`} />{option.label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                     <Label>Language</Label>
                     <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-full" aria-label="Language"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-72">
                           {languageOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                        </SelectContent>
                     </Select>
                  </div>
                  <Button
                     data-testid="load_ideas"
                     disabled={!adwordsConnected || isLoadingIdeas}
                     title={!adwordsConnected ? 'Please connect your Google Ads account to generate keyword ideas.' : undefined}
                     onClick={submit}
                  >
                     {isLoadingIdeas ? <Loader2 className="animate-spin" /> : <Download />}
                     {isLoadingIdeas ? 'Loading…' : 'Load Ideas'}
                  </Button>
               </CardContent>
            </Card>

            <IdeasTable
               domain={null}
               ideas={ideas}
               favorites={favorites}
               isLoading={isLoading}
               noIdeasDatabase={isError}
               adwordsConnected={adwordsConnected}
               showFavorites={showFavorites}
               onShowFavorites={setShowFavorites}
               domains={domains}
               allowsCity={allowsCity}
            />
         </div>
      </div>
   );
}
