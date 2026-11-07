import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import SelectField from '../common/SelectField';
import TagInput from './TagInput';
import countries from '../../utils/countries';
import { useAddKeywords } from '../../services/keywords';
import { buildStoredLocation, hasValidCityStatePair } from '../../utils/location';
import { getDomainTags } from '../../utils/keywordMeta';

type AddKeywordsProps = {
   keywords: KeywordType[],
   scraperName: string,
   allowsCity: boolean,
   closeModal: (show?: boolean) => void,
   domain: string,
   scraperCountries?: string[],
}

type KeywordsInput = {
   keywords: string,
   device: string,
   country: string,
   domain: string,
   tags: string,
   city?:string,
   state?:string,
}

const AddKeywords = forwardRef<HTMLDivElement, AddKeywordsProps>(({
   closeModal,
   domain,
   keywords,
   scraperName = '',
   allowsCity = false,
   scraperCountries,
}: AddKeywordsProps, ref) => {
   const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   const [error, setError] = useState<string>('');
   const [newKeywordsData, setNewKeywordsData] = useState<KeywordsInput>({
      keywords: '',
      device: 'desktop',
      country: 'US',
      domain,
      tags: '',
      city: '',
      state: '',
   });
   
   // Cleanup timeout on unmount
   useEffect(() => () => {
         if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
         }
      }, []);

   useEffect(() => {
      if (typeof window === 'undefined') {
         return;
      }

      try {
         const storedCountry = window.localStorage.getItem('default_country');
         if (storedCountry) {
            setNewKeywordsData((prev) => ({ ...prev, country: storedCountry }));
         }
      } catch (_error) {
         // Ignore storage access errors during SSR/tests
      }
   }, []);
   
   // Helper function to set error with auto-clear
   const setErrorWithTimeout = useCallback((errorMessage: string) => {
      if (errorTimeoutRef.current) {
         clearTimeout(errorTimeoutRef.current);
      }
      setError(errorMessage);
      errorTimeoutRef.current = setTimeout(() => {
         setError('');
         errorTimeoutRef.current = null;
      }, 3000);
   }, []);
   
   const { mutate: addMutate, isLoading: isAdding } = useAddKeywords(() => closeModal(false));

   // Filter countries based on scraper support
   const availableCountries = useMemo(() => {
      const allCountryCodes = Object.keys(countries);
      
      // If scraper defines specific countries, use only those
      if (scraperCountries && scraperCountries.length > 0) {
         return allCountryCodes
            .filter((code) => scraperCountries.includes(code) && countries[code])
            .map((countryISO: string) => ({ 
               label: countries[countryISO][0], 
               value: countryISO 
            }));
      }
      
      // Otherwise, only show countries with non-null googleDomain
      return allCountryCodes
         .filter((code) => countries[code] && countries[code][4] !== null)
         .map((countryISO: string) => ({ 
            label: countries[countryISO][0], 
            value: countryISO 
         }));
   }, [scraperCountries]);

   const existingTags: string[] = useMemo(() => getDomainTags(keywords), [keywords]);

   const setDeviceType = useCallback((input:string) => {
      setNewKeywordsData((prev) => {
         const selected = prev.device ? prev.device.split(',').filter(Boolean) : [];
         let next: string[];
         if (selected.includes(input)) {
            next = selected.filter((d) => d !== input);
            // Keep at least one device selected so a keyword is never saved with an empty device
            if (next.length === 0) { return prev; }
         } else {
            next = [...selected, input];
         }
         return { ...prev, device: next.join(',') };
      });
   }, []);

   const addKeywords = () => {
      const nkwrds = newKeywordsData;
      const keywordsArray = [...new Set(nkwrds.keywords.split('\n').map((item) => item.trim()).filter((item) => !!item))];
      if (keywordsArray.length > 0) {
         const devices = nkwrds.device.split(',').filter(Boolean);
         const multiDevice = devices.length > 1;

         const currentKeywords = new Set(keywords.map((k) => JSON.stringify([k.keyword, k.device, k.location || k.country])));

         const trimmedCity = (nkwrds.city || '').trim();
         const trimmedState = (nkwrds.state || '').trim();

         if (!hasValidCityStatePair(trimmedCity, trimmedState)) {
            setErrorWithTimeout('City and state must be provided together.');
            return;
         }

         // Stored as "City,State,Country Name"; a country-only keyword stores a blank location
         const locationString = allowsCity
            ? buildStoredLocation({ city: trimmedCity, state: trimmedState, countryCode: nkwrds.country })
            : '';

          const keywordExist = keywordsArray.filter((k) =>
             devices.some((device) => {
                const id = JSON.stringify([k, device, locationString || nkwrds.country]);
                return currentKeywords.has(id);
             }),
          );

         // Only block when every submitted keyword already exists; partial duplicates are skipped below
         if (!multiDevice && keywordExist.length > 0 && keywordExist.length === keywordsArray.length) {
            setErrorWithTimeout(`Keywords ${keywordExist.join(',')} already Exist`);
         } else {
            const skipped: string[] = [];
            const newKeywords = keywordsArray.flatMap((k) =>
               devices
                  .filter((device) => {
                     const id = JSON.stringify([k, device, locationString || nkwrds.country]);
                     if (currentKeywords.has(id)) {
                        skipped.push(`${k} (${device})`);
                        return false;
                     }
                     return true;
                  })
                  .map((device) => ({
                     keyword: k,
                     device,
                     country: nkwrds.country,
                     domain: nkwrds.domain,
                     tags: nkwrds.tags,
                     location: locationString,
                  })),
            );
            if (newKeywords.length > 100) {
               setErrorWithTimeout('You can add at most 100 keyword and device combinations at once.');
               return;
            }
            addMutate({ payloads: newKeywords, skipped });
         }
      } else {
         setErrorWithTimeout('Please Insert a Keyword');
      }
   };

   const deviceTabStyle = 'cursor-pointer px-2 py-2 rounded';

   return (
      <Modal ref={ref} closeModal={() => { closeModal(false); }} title={'Add New Keywords'} width="[420px]">
         <div data-testid="addkeywords_modal">
            <div>
               <div>
                  <textarea
                     className='w-full h-40 border rounded border-gray-200 p-4 outline-none focus:border-indigo-300'
                     placeholder="Type or Paste Keywords here. Insert Each keyword in a New line."
                     value={newKeywordsData.keywords}
                     onChange={(e) => setNewKeywordsData({ ...newKeywordsData, keywords: e.target.value })}>
                  </textarea>
               </div>

               <div className=' my-3 flex justify-between text-sm'>
                  <div>
                  <SelectField
                     multiple={false}
                     selected={[newKeywordsData.country]}
                     options={availableCountries}
                     defaultLabel='All Countries'
                     updateField={(updated:string[]) => {
                        const nextCountry = updated[0];
                        setNewKeywordsData({ ...newKeywordsData, country: nextCountry });
                        if (typeof window !== 'undefined') {
                           try {
                              window.localStorage.setItem('default_country', nextCountry);
                           } catch (_error) {
                              // Ignore storage access errors during SSR/tests
                           }
                        }
                     }}
                     rounded='rounded'
                     maxHeight={48}
                     flags={true}
                  />
                  </div>
                  <ul className='flex text-xs font-semibold text-gray-500'>
                     <li><button type="button" aria-pressed={newKeywordsData.device.includes('desktop')} className={`${deviceTabStyle} mr-2 ${newKeywordsData.device.includes('desktop') ? '  bg-indigo-50 text-indigo-700' : ''}`} onClick={() => setDeviceType('desktop')}>
                           <Icon type='desktop' classes={'top-[3px]'} size={15} /> <i className='not-italic hidden lg:inline-block'>Desktop</i>
                           <Icon type='check' classes={'pl-1'} size={12} color={newKeywordsData.device.includes('desktop') ? '#4338ca' : '#bbb'} />
                        </button></li>
                     <li><button type="button" aria-pressed={newKeywordsData.device.includes('mobile')} className={`${deviceTabStyle} ${newKeywordsData.device.includes('mobile') ? '  bg-indigo-50 text-indigo-700' : ''}`} onClick={() => setDeviceType('mobile')}>
                           <Icon type='mobile' /> <i className='not-italic hidden lg:inline-block'>Mobile</i>
                           <Icon type='check' classes={'pl-1'} size={12} color={newKeywordsData.device.includes('mobile') ? '#4338ca' : '#bbb'} />
                        </button></li>
                  </ul>
               </div>
               <TagInput
                  value={newKeywordsData.tags}
                  onChange={(tags) => setNewKeywordsData({ ...newKeywordsData, tags })}
                  existingTags={existingTags}
                  placeholder='Insert Tags (Optional)'
               />
               <div className='relative mt-2'>
                  <input
                     className={`w-full border rounded border-gray-200 py-2 px-4 pl-8
                     outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''} `}
                     disabled={!allowsCity}
                     title={!allowsCity ? `Your scraper ${scraperName} doesn't have city level scraping feature.` : ''}
                     placeholder={allowsCity ? 'State (Optional)' : 'N/A'}
                     value={newKeywordsData.state}
                     onChange={(e) => setNewKeywordsData({ ...newKeywordsData, state: e.target.value })}
                  />
                  <span className='absolute text-gray-400 top-2 left-2'><Icon type="city" size={16} /></span>
               </div>
               <div className='relative mt-2'>
                  <input
                     className={`w-full border rounded border-gray-200 py-2 px-4 pl-8
                     outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''} `}
                     disabled={!allowsCity}
                     title={!allowsCity ? `Your scraper ${scraperName} doesn't have city level scraping feature.` : ''}
                     placeholder={allowsCity ? 'City (Optional)' : 'N/A'}
                     value={newKeywordsData.city}
                     onChange={(e) => setNewKeywordsData({ ...newKeywordsData, city: e.target.value })}
                  />
                  <span className='absolute text-gray-400 top-2 left-2'><Icon type="city" size={16} /></span>
               </div>
            </div>
            {error && <div className='w-full mt-4 p-3 text-sm bg-red-50 text-red-700'>{error}</div>}
            <div className='mt-6 text-right text-sm font-semibold flex justify-between'>
               <button
                  className=' py-2 px-5 rounded cursor-pointer bg-indigo-50 text-slate-500 mr-3'
                  onClick={() => closeModal(false)}>
                     Cancel
               </button>
               <button
                  className=' py-2 px-5 rounded cursor-pointer bg-blue-700 text-white'
                  onClick={() => !isAdding && addKeywords()}>
                     {isAdding ? 'Adding....' : 'Add Keywords'}
               </button>
            </div>
         </div>
      </Modal>
   );
});

AddKeywords.displayName = 'AddKeywords';

export default AddKeywords;
