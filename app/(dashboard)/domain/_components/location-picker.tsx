'use client';

import { useMemo, useState } from 'react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import countries from 'utils/countries';
import { buildStoredLocation, getLocationCountry, hasValidCityStatePair, isCountryOnlyLocation } from 'utils/location';

type LocationPickerProps = {
   existingLocations: string[];
   value: string;
   /** Reports the stored location ("City,State,Country Name", or '' for country-only) and its country code. */
   onChange: (location: string, country: string) => void;
   allowsCity: boolean;
   /** Adds "Existing Locations" and "New Location" subheaders, matching the Add Keywords form. */
   sectionLabels?: boolean;
   defaultCountry?: string;
};

const getDefaultCountry = (): string => {
   if (typeof window === 'undefined') { return 'US'; }
   try {
      return window.localStorage.getItem('default_country') || 'US';
   } catch (_error) {
      return 'US';
   }
};

const COUNTRY_OPTIONS = Object.keys(countries)
   .filter((code) => countries[code])
   .map((code) => ({ label: countries[code][0], value: code }));

/**
 * Existing domain locations plus a "new location" form (city, state, country, Add).
 * City and state must be filled together or both left empty. Empty city and state means country-only,
 * which stores a blank location and keeps the chosen country in the country column.
 */
export function LocationPicker({
   existingLocations = [], value, onChange, allowsCity = false, sectionLabels = false, defaultCountry,
}: LocationPickerProps) {
   const [newLocation, setNewLocation] = useState<string | null>(null);
   const [city, setCity] = useState('');
   const [state, setState] = useState('');
   const [country, setCountry] = useState<string>(() => defaultCountry || getDefaultCountry());
   const [error, setError] = useState('');
   // True once a country-only choice (blank location) was added, so a later country change is reported too.
   const [countryOnlyPicked, setCountryOnlyPicked] = useState(false);

   const locationOptions = useMemo(() => {
      const values = [...existingLocations, value, newLocation]
         .filter((loc): loc is string => typeof loc === 'string' && loc !== '' && (allowsCity || isCountryOnlyLocation(loc)));
      return [...new Set(values)];
   }, [existingLocations, value, newLocation, allowsCity]);

   const pickExistingLocation = (selected: string) => {
      const pickedCountry = getLocationCountry(selected) || country;
      setNewLocation(null);
      setCountryOnlyPicked(false);
      setCountry(pickedCountry);
      onChange(selected, pickedCountry);
   };

   const addNewLocation = () => {
      const trimmedCity = city.trim();
      const trimmedState = state.trim();
      if (!hasValidCityStatePair(trimmedCity, trimmedState)) {
         setError('City and state must be provided together.');
         return;
      }
      setError('');
      const location = allowsCity && trimmedCity ? buildStoredLocation({ city: trimmedCity, state: trimmedState, countryCode: country }) : '';
      setNewLocation(location || null);
      setCountryOnlyPicked(!location);
      onChange(location, country);
      setCity('');
      setState('');
   };

   return (
      <div className="flex flex-col gap-2">
         {sectionLabels && <p className="text-muted-foreground text-sm font-semibold">Existing Locations</p>}
         <Select value={value || undefined} onValueChange={pickExistingLocation}>
            <SelectTrigger className="w-full" aria-label="Existing location">
               <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
               {locationOptions.map((location) => <SelectItem key={location} value={location}>{location}</SelectItem>)}
            </SelectContent>
         </Select>

         {sectionLabels && <p className="text-muted-foreground mt-2 text-sm font-semibold">New Location</p>}
         <Input
            disabled={!allowsCity}
            placeholder={allowsCity ? 'City (optional)' : 'N/A'}
            aria-label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
         />
         <Input
            disabled={!allowsCity}
            placeholder={allowsCity ? 'State (optional)' : 'N/A'}
            aria-label="State"
            value={state}
            onChange={(event) => setState(event.target.value)}
         />
         <div className="flex items-center gap-2">
            <Select
               value={country}
               onValueChange={(next) => {
                  setCountry(next);
                  // Keep a country-only selection in step with the dropdown so the saved country is not stale.
                  if (countryOnlyPicked) { onChange('', next); }
               }}
            >
               <SelectTrigger className="min-w-0 flex-1" aria-label="Country">
                  <SelectValue placeholder="Country" />
               </SelectTrigger>
               <SelectContent className="max-h-72">
                  {COUNTRY_OPTIONS.map((option) => (
                     <SelectItem key={option.value} value={option.value}>
                        <span className={`fflag fflag-${option.value} h-[12px] w-[18px] shrink-0`} />{option.label}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            <Button type="button" onClick={addNewLocation}>Add</Button>
         </div>
         {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      </div>
   );
}
