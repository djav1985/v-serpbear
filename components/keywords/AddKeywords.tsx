import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import SelectField from '../common/SelectField';
import countries from '../../utils/countries';
import { useAddKeywords } from '../../services/keywords';
import { formatLocation, hasValidCityStatePair, parseLocation } from '../../utils/location';

type AddKeywordsProps = {
   keywords: KeywordType[],
   scraperName: string,
   allowsCity: boolean,
   closeModal: Function,
   domain: string
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
}: AddKeywordsProps, ref) => {
   const inputRef = useRef(null);
   const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   const [error, setError] = useState<string>('');
   const [showTagSuggestions, setShowTagSuggestions] = useState(false);
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

   const existingTags: string[] = useMemo(() => {
      const allTags = keywords.reduce((acc: string[], keyword) => [...acc, ...keyword.tags], []).filter((t) => t && t.trim() !== '');
      return [...new Set(allTags)];
   }, [keywords]);

   const setDeviceType = useCallback((input:string) => {
      let updatedDevice = '';
      if (newKeywordsData.device.includes(input)) {
         updatedDevice = newKeywordsData.device.replace(',', '').replace(input, '');
      } else {
         updatedDevice = newKeywordsData.device ? `${newKeywordsData.device},${input}` : input;
      }
      setNewKeywordsData({ ...newKeywordsData, device: updatedDevice });
   }, [newKeywordsData]);

   const addKeywords = () => {
      const nkwrds = newKeywordsData;
      if (nkwrds.keywords) {
         const devices = nkwrds.device.split(',');
         const multiDevice = nkwrds.device.includes(',') && devices.length > 1;
         const keywordsArray = [...new Set(nkwrds.keywords.split('\n').map((item) => item.trim()).filter((item) => !!item))];

         const currentKeywords = keywords.map((k) => {
            const locationParts = parseLocation(k.location, k.country);
            const locationKey = formatLocation({ ...locationParts, country: k.country });
            return `${k.keyword}-${k.device}-${locationKey || k.country}`;
         });

         const trimmedCity = (nkwrds.city || '').trim();
         const trimmedState = (nkwrds.state || '').trim();

         if (!hasValidCityStatePair(trimmedCity, trimmedState)) {
            setErrorWithTimeout('City and state must be provided together.');
            return;
         }

         const locationString = allowsCity
            ? formatLocation({ city: trimmedCity, state: trimmedState, country: nkwrds.country })
            : formatLocation({ country: nkwrds.country });

          const keywordExist = keywordsArray.filter((k) =>
             devices.some((device) => {
                const id = `${k}-${device}-${locationString || nkwrds.country}`;
                return currentKeywords.includes(id);
             }),
          );

         if (!multiDevice && (keywordsArray.length === 1 || currentKeywords.length === keywordExist.length) && keywordExist.length > 0) {
            setErrorWithTimeout(`Keywords ${keywordExist.join(',')} already Exist`);
         } else {
            const newKeywords = keywordsArray.flatMap((k) =>
               devices
                  .filter((device) => {
                     const id = `${k}-${device}-${locationString || nkwrds.country}`;
                     return !currentKeywords.includes(id);
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
            addMutate(newKeywords);
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
                     options={Object.keys(countries).map((countryISO:string) => ({ label: countries[countryISO][0], value: countryISO }))}
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
                     <li
                        className={`${deviceTabStyle} mr-2 ${newKeywordsData.device.includes('desktop') ? '  bg-indigo-50 text-indigo-700' : ''}`}
                        onClick={() => setDeviceType('desktop')}>
                           <Icon type='desktop' classes={'top-[3px]'} size={15} /> <i className='not-italic hidden lg:inline-block'>Desktop</i>
                           <Icon type='check' classes={'pl-1'} size={12} color={newKeywordsData.device.includes('desktop') ? '#4338ca' : '#bbb'} />
                        </li>
                     <li
                        className={`${deviceTabStyle} ${newKeywordsData.device.includes('mobile') ? '  bg-indigo-50 text-indigo-700' : ''}`}
                        onClick={() => setDeviceType('mobile')}>
                           <Icon type='mobile' /> <i className='not-italic hidden lg:inline-block'>Mobile</i>
                           <Icon type='check' classes={'pl-1'} size={12} color={newKeywordsData.device.includes('mobile') ? '#4338ca' : '#bbb'} />
                        </li>
                  </ul>
               </div>
               <div className='relative'>
                  <input
                     className='w-full border rounded border-gray-200 py-2 px-4 pl-12 outline-none focus:border-indigo-300'
                     placeholder='Insert Tags (Optional)'
                     value={newKeywordsData.tags}
                     onChange={(e) => setNewKeywordsData({ ...newKeywordsData, tags: e.target.value })}
                  />
                  <span className='absolute text-gray-400 top-3 left-2 cursor-pointer' onClick={() => setShowTagSuggestions(!showTagSuggestions)}>
                     <Icon type="tags" size={16} color={showTagSuggestions ? '#777' : '#aaa'} />
                     <Icon type={showTagSuggestions ? 'caret-up' : 'caret-down'} size={14} color={showTagSuggestions ? '#666' : '#aaa'} />
                  </span>
                  {showTagSuggestions && (
                     <ul className={`absolute z-50
                     bg-white border border-t-0 border-gray-200 rounded rounded-t-none w-full`}>
                        {existingTags.length > 0 && existingTags.map((tag, index) => (
                              newKeywordsData.tags
                                 .split(',')
                                 .map((t) => t.trim())
                                 .includes(tag) === false && (
                                    <li
                                       className=' p-2 cursor-pointer hover:text-indigo-600 hover:bg-indigo-50 transition'
                                       key={index}
                                       onClick={() => {
                                          const tagInput = newKeywordsData.tags;
                                           
                                          const tagToInsert = tagInput + (tagInput.trim().slice(-1) === ',' ? '' : tagInput.trim() ? ', ' : '') + tag;
                                          setNewKeywordsData({ ...newKeywordsData, tags: tagToInsert });
                                          setShowTagSuggestions(false);
                                          if (inputRef?.current) (inputRef.current as HTMLInputElement).focus();
                                       }}>
                                       <Icon type='tags' size={14} color='#bbb' /> {tag}
                                    </li>
                                 )
                           ))}
               {existingTags.length === 0 && <p>No Existing Tags Found... </p>}
                    </ul>
                 )}
              </div>
               <div className='relative mt-2'>
                  <input
                     className={`w-full border rounded border-gray-200 py-2 px-4 pl-8
                     outline-none focus:border-indigo-300 ${!allowsCity ? ' cursor-not-allowed' : ''} `}
                     disabled={!allowsCity}
                     title={!allowsCity ? `Your scraper ${scraperName} doesn't have city level scraping feature.` : ''}
                     placeholder={`State (Optional${!allowsCity ? ` — not available for ${scraperName}` : ''})`}
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
                     placeholder={`City (Optional${!allowsCity ? ` — not available for ${scraperName}` : ''})`}
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
