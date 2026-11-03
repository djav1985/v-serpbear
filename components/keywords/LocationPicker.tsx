import { useState } from 'react';
import Icon from '../common/Icon';
import SelectField from '../common/SelectField';
import countries from '../../utils/countries';
import { formatLocation, hasValidCityStatePair } from '../../utils/location';

type LocationPickerProps = {
   existingLocations: string[],
   value: string,
   onChange: (location: string) => void,
   allowsCity: boolean,
   // When true, '' means "each keyword's own country" and is offered as the first option
   allowDefault?: boolean,
}

const DEFAULT_OPTION_LABEL = "Each keyword's country (default)";

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
// Only one location is applied at a time: picking another option discards a newly added one.
const LocationPicker = ({ existingLocations = [], value, onChange, allowsCity = false, allowDefault = false }: LocationPickerProps) => {
   const [newLocation, setNewLocation] = useState<string | null>(null);
   const [city, setCity] = useState('');
   const [state, setState] = useState('');
   const [country, setCountry] = useState<string>(getDefaultCountry);
   const [error, setError] = useState('');

   const locationValues = [
      ...(allowDefault ? [''] : []),
      ...existingLocations,
      value,
      newLocation,
   ].filter((loc): loc is string => typeof loc === 'string' && (loc !== '' || allowDefault));
   const locationOptions = [...new Set(locationValues)].map((loc) => ({ label: loc || DEFAULT_OPTION_LABEL, value: loc }));

   const addNewLocation = () => {
      const trimmedCity = city.trim();
      const trimmedState = state.trim();
      if (!hasValidCityStatePair(trimmedCity, trimmedState)) {
         setError('City and state must be provided together.');
         return;
      }
      const location = allowsCity
         ? formatLocation({ city: trimmedCity, state: trimmedState, country })
         : formatLocation({ country });
      setError('');
      setNewLocation(location);
      onChange(location);
      setCity('');
      setState('');
   };

   return (
      <div className='flex flex-col gap-2'>
         <div className='[&_.selected]:py-2 [&_.selected]:px-4'>
            <SelectField
               multiple={false}
               selected={[value]}
               options={locationOptions}
               defaultLabel='Select a Location'
               updateField={(updated: string[]) => {
                  const selectedLocation = updated[0];
                  if (selectedLocation === undefined) { return; }
                  setNewLocation(null);
                  onChange(selectedLocation);
               }}
               rounded='rounded'
               maxHeight={48}
               flags={false}
               fullWidth={true}
            />
         </div>
         <div className='relative'>
            <input
               className={`w-full border rounded border-gray-200 py-2 px-4 pl-8 outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''}`}
               disabled={!allowsCity}
               placeholder={`City (Optional${!allowsCity ? ' — not available for this scraper' : ''})`}
               value={city}
               onChange={(e) => setCity(e.target.value)}
            />
            <span className='absolute text-gray-400 top-2 left-2'><Icon type="city" size={16} /></span>
         </div>
         <div className='relative'>
            <input
               className={`w-full border rounded border-gray-200 py-2 px-4 pl-8 outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''}`}
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
                  updateField={(updated: string[]) => { if (updated[0]) setCountry(updated[0]); }}
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
