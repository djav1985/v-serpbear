import { useState } from 'react';
import Icon from '../common/Icon';
import SelectField from '../common/SelectField';
import countries from '../../utils/countries';
import { buildStoredLocation, getLocationCountry, hasValidCityStatePair } from '../../utils/location';

type LocationPickerProps = {
   existingLocations: string[],
   value: string,
   // Reports the stored location ("City,State,Country Name", or '' for country-only) and its country code
   onChange: (location: string, country: string) => void,
   allowsCity: boolean,
   // Adds "Existing Locations" and "New Location" subheaders, matching the Add Keywords form labels
   sectionLabels?: boolean,
   defaultCountry?: string,
}

const getDefaultCountry = (): string => {
   if (typeof window === 'undefined') { return 'US'; }
   try {
      return window.localStorage.getItem('default_country') || 'US';
   } catch (_error) {
      return 'US';
   }
};

const countryOptions = Object.keys(countries)
   .filter((code) => countries[code])
   .map((code) => ({ label: countries[code][0], value: code }));

// Existing domain locations plus a "new location" form (city, state, country, Add).
// City and state must be filled together or both left empty. Empty city and state means country-only,
// which stores a blank location and keeps the chosen country in the country column.
const LocationPicker = ({ existingLocations = [], value, onChange, allowsCity = false, sectionLabels = false, defaultCountry }: LocationPickerProps) => {
   const [newLocation, setNewLocation] = useState<string | null>(null);
   const [city, setCity] = useState('');
   const [state, setState] = useState('');
   const [country, setCountry] = useState<string>(defaultCountry || getDefaultCountry);
   const [error, setError] = useState('');
   // True once a country-only choice (blank location) was added, so a later country change must be reported too
   const [countryOnlyPicked, setCountryOnlyPicked] = useState(false);

   const locationValues = [
      ...existingLocations,
      value,
      newLocation,
   ].filter((loc): loc is string => typeof loc === 'string' && loc !== '');
   const locationOptions = [...new Set(locationValues)].map((loc) => ({ label: loc, value: loc }));

   const pickExistingLocation = (selectedLocation: string) => {
      const pickedCountry = getLocationCountry(selectedLocation) || country;
      setNewLocation(null);
      setCountryOnlyPicked(false);
      setCountry(pickedCountry);
      onChange(selectedLocation, pickedCountry);
   };

   const addNewLocation = () => {
      const trimmedCity = city.trim();
      const trimmedState = state.trim();
      if (!hasValidCityStatePair(trimmedCity, trimmedState)) {
         setError('City and state must be provided together.');
         return;
      }
      setError('');
      const location = allowsCity && trimmedCity
         ? buildStoredLocation({ city: trimmedCity, state: trimmedState, countryCode: country })
         : '';
      setNewLocation(location || null);
      setCountryOnlyPicked(!location);
      onChange(location, country);
      setCity('');
      setState('');
   };

   return (
      <div className='flex flex-col gap-2'>
         {sectionLabels && <p className='text-sm font-semibold text-gray-500 mb-1'>Existing Locations</p>}
         <div className='[&_.selected]:py-2 [&_.selected]:px-4'>
            <SelectField
               multiple={false}
               selected={value ? [value] : []}
               options={locationOptions}
               defaultLabel='Select a Location'
               updateField={(updated: string[]) => {
                  const selectedLocation = updated[0];
                  if (selectedLocation === undefined) { return; }
                  pickExistingLocation(selectedLocation);
               }}
               rounded='rounded'
               maxHeight={48}
               flags={false}
               fullWidth={true}
            />
         </div>
         {sectionLabels && <p className='text-sm font-semibold text-gray-500 mt-2 mb-1'>New Location</p>}
         <div className='relative'>
            <input
               className={`w-full h-[42px] border rounded border-gray-200 py-2 px-4 pl-8 text-sm outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''}`}
               disabled={!allowsCity}
               placeholder={`City (Optional${!allowsCity ? ' — not available for this scraper' : ''})`}
               value={city}
               onChange={(e) => setCity(e.target.value)}
            />
            <span className='absolute text-gray-400 top-2 left-2'><Icon type="city" size={16} /></span>
         </div>
         <div className='relative'>
            <input
               className={`w-full h-[42px] border rounded border-gray-200 py-2 px-4 pl-8 text-sm outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''}`}
               disabled={!allowsCity}
               placeholder={`State (Optional${!allowsCity ? ' — not available for this scraper' : ''})`}
               value={state}
               onChange={(e) => setState(e.target.value)}
            />
            <span className='absolute text-gray-400 top-2 left-2'><Icon type="city" size={16} /></span>
         </div>
         <div className='flex gap-2 items-center'>
            <div className='flex-1'>
               <SelectField
                  multiple={false}
                  selected={[country]}
                  options={countryOptions}
                  defaultLabel='All Countries'
                  updateField={(updated: string[]) => {
                     if (!updated[0]) { return; }
                     setCountry(updated[0]);
                     // Keep a country-only selection in step with the dropdown so the saved country is not stale
                     if (countryOnlyPicked) { onChange('', updated[0]); }
                  }}
                  rounded='rounded'
                  maxHeight={48}
                  flags={true}
                  fullWidth={true}
               />
            </div>
            <button
               type='button'
               className='py-2 px-5 min-w-[80px] text-center rounded cursor-pointer bg-indigo-600 text-white font-semibold text-sm'
               onClick={addNewLocation}>
               Add
            </button>
         </div>
         {error && <p className='text-red-500 text-sm'>{error}</p>}
      </div>
   );
};

export default LocationPicker;
