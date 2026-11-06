/// <reference path="../../types.d.ts" />

import { useRouter } from 'next/router';
import React, { useState, useMemo, useEffect } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { useAddKeywords, useFetchKeywords } from '../../services/keywords';
import { SCfilterKeywords, SCkeywordsByDevice, SCsortKeywords } from '../../utils/client/sortFilter';
import Icon from '../common/Icon';
import SpinnerMessage from '../common/SpinnerMessage';
import KeywordFilters from './KeywordFilter';
import SCKeyword from './SCKeyword';
import useWindowResize from '../../hooks/useWindowResize';
import useIsMobile from '../../hooks/useIsMobile';
import { formattedNum } from '../../utils/client/helpers';
import { buildKeywordAddPayloads, getDomainLocations, getDomainTags, scraperAllowsCity, TrackerDevice } from '../../utils/keywordMeta';
import { isCountryOnlyLocation } from '../../utils/location';
import { useFetchSettings } from '../../services/settings';
import AddToTrackerBar from './AddToTrackerBar';
import AddKeywordsMetaStep from './AddKeywordsMetaStep';

type SCKeywordsTableProps = {
   domain: DomainType | null,
   keywords: SearchAnalyticsItem[],
   isLoading: boolean,
   isConsoleIntegrated: boolean,
}

type SCCountryDataType = {
   keywords: number,
   impressions: number,
   visits: number
}

type SCRowData = {
   items: SCKeywordType[],
   selectedKeywords: string[],
   selectKeyword: (keywordID: string, isTrackedKeyword?: boolean) => void,
   trackedKeywordLookup: Record<string, boolean>,
};

// Search Console rows are country level, so a row counts as tracked only when it is tracked without a city location.
const scTrackedKey = (keyword: string, country: string, device: string) => `${keyword}:${country}:${device}`;
// A blank location and a country-only location ("US", "United States") are the same country-level target.
const normalizeLocation = (location?: string | null) => {
   const trimmed = (location || '').trim();
   return isCountryOnlyLocation(trimmed) ? '' : trimmed;
};
// Full tracking identity used when adding: keyword, country, device and location.
const fullTrackedKey = (keyword: string, country: string, device: string, location: string) => `${keyword}:${country}:${device}:${location}`;

// Defined at module scope so react-window does not remount rows on every render. State comes in through itemData.
const SCKeywordRow = ({ data, index, style }: ListChildComponentProps<SCRowData>) => {
   const keyword = data.items[index];
   return (
      <SCKeyword
      key={keyword.uid}
      style={style}
      selected={data.selectedKeywords.includes(keyword.uid)}
      selectKeyword={data.selectKeyword}
      keywordData={keyword}
      isTracked={!!data.trackedKeywordLookup[scTrackedKey(keyword.keyword, keyword.country, keyword.device)]}
      lastItem={index === (data.items.length - 1)}
      />
   );
};

const SCKeywordsTable = ({ domain, keywords = [], isLoading = true, isConsoleIntegrated = true }: SCKeywordsTableProps) => {
   const router = useRouter();
   const [device, setDevice] = useState<string>('desktop');
   const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
   const [filterParams, setFilterParams] = useState<KeywordFilters>({ countries: [], tags: [], search: '' });
   const [sortBy, setSortBy] = useState<string>('imp_desc');
   const [SCListHeight, setSCListHeight] = useState(500);
   const [addDevices, setAddDevices] = useState<TrackerDevice[]>(['desktop']);
   const [showAddStep, setShowAddStep] = useState<boolean>(false);
   const { data: appSettingsData } = useFetchSettings();
   const allowsCity = scraperAllowsCity(appSettingsData?.settings);
   const { keywordsData } = useFetchKeywords(router, domain?.domain || '');
   const trackedKeywordsList: KeywordType[] = useMemo(() => {
      if (Array.isArray(keywordsData)) {
         return keywordsData as KeywordType[];
      }
      return (keywordsData?.keywords || []) as KeywordType[];
   }, [keywordsData]);

   const trackedKeywordLookup = useMemo(() => trackedKeywordsList.reduce((lookup: Record<string, boolean>, trackedKeyword: KeywordType) => {
      const { keyword: trackedKeywordValue, country: trackedCountry, device: trackedDevice } = trackedKeyword;
      if (trackedKeywordValue && trackedCountry && trackedDevice && !normalizeLocation(trackedKeyword.location)) {
         lookup[scTrackedKey(trackedKeywordValue, trackedCountry, trackedDevice)] = true;
      }
      return lookup;
   }, {}), [trackedKeywordsList]);
   // Exact tracking targets (including location), used to skip only true duplicates when adding
   const trackedTargetLookup = useMemo(() => trackedKeywordsList.reduce((lookup: Record<string, boolean>, trackedKeyword: KeywordType) => {
      const { keyword: trackedKeywordValue, country: trackedCountry, device: trackedDevice } = trackedKeyword;
      if (trackedKeywordValue && trackedCountry && trackedDevice) {
         lookup[fullTrackedKey(trackedKeywordValue, trackedCountry, trackedDevice, normalizeLocation(trackedKeyword.location))] = true;
      }
      return lookup;
   }, {}), [trackedKeywordsList]);
   const { mutate: addKeywords, isLoading: isAddingKeywords } = useAddKeywords(() => { if (domain && domain.slug) router.push(`/domain/${domain.slug}`); });
   const [isMobile] = useIsMobile();
   useWindowResize(() => setSCListHeight(window.innerHeight - (isMobile ? 200 : 400)));

   const finalKeywords: {[key:string] : SCKeywordType[] } = useMemo(() => {
      const procKeywords = keywords.filter((x) => x.device === device);
      const filteredKeywords = SCfilterKeywords(procKeywords, filterParams);
      const sortedKeywords = SCsortKeywords(filteredKeywords, sortBy);
      return SCkeywordsByDevice(sortedKeywords, device);
   }, [keywords, device, filterParams, sortBy]);

   const SCCountryData: {[key:string] : SCCountryDataType } = useMemo(() => {
      const countryData:{[key:string] : SCCountryDataType } = {};

      // Built from the unfiltered keywords so the country options do not shrink to the selected country
      keywords.filter((x) => x.device === device).forEach((keyword) => {
         const kCountry = keyword.country;
         if (!countryData[kCountry]) { countryData[kCountry] = { keywords: 0, impressions: 0, visits: 0 }; }
         countryData[kCountry].keywords += 1;
         countryData[kCountry].visits += (keyword.clicks || 0);
         countryData[kCountry].impressions += (keyword.impressions || 0);
      });

      return countryData;
   }, [keywords, device]);

   const viewSummary: {[key:string] : number } = useMemo(() => {
      const keywordsForDevice = finalKeywords[device] || [];
      const keyCount = keywordsForDevice.length;
      if (keyCount === 0) {
         return { position: 0, impressions: 0, visits: 0, ctr: 0 };
      }
      // Position is weighted by impressions and CTR is total clicks over total impressions.
      // With no impressions at all, position falls back to a plain average and CTR to 0.
      let totalImpressions = 0;
      let totalVisits = 0;
      let impressionWeightedPosition = 0;
      let positionSum = 0;
      keywordsForDevice.forEach((keyword) => {
         const impressions = keyword.impressions ?? 0;
         const position = keyword.position ?? 0;
         totalImpressions += impressions;
         totalVisits += keyword.clicks ?? 0;
         impressionWeightedPosition += position * impressions;
         positionSum += position;
      });
      return {
         position: Math.round(totalImpressions > 0 ? impressionWeightedPosition / totalImpressions : positionSum / keyCount),
         impressions: totalImpressions,
         visits: totalVisits,
         ctr: totalImpressions > 0 ? (totalVisits / totalImpressions) * 100 : 0,
      };
   }, [finalKeywords, device]);

   const selectKeyword = (keywordID: string, isTrackedKeyword = false) => {
      if (isTrackedKeyword) { return; }
      let updatedSelected = [...selectedKeywords, keywordID];
      if (selectedKeywords.includes(keywordID)) {
         updatedSelected = selectedKeywords.filter((keyID) => keyID !== keywordID);
      }
      setSelectedKeywords(updatedSelected);
   };

   const existingTags = useMemo(() => getDomainTags(trackedKeywordsList), [trackedKeywordsList]);
   const existingLocations = useMemo(() => getDomainLocations(trackedKeywordsList), [trackedKeywordsList]);

   const openAddStep = () => {
      if (addDevices.length > 0) { setShowAddStep(true); }
   };

   const submitSCKeywordsToTracker = ({ tags, location, country }: { tags: string[], location: string, country: string }) => {
      if (isAddingKeywords) { return; }
      const selectedItems = finalKeywords[device]
         .filter((kitem:SCKeywordType) => selectedKeywords.includes(kitem.uid))
         .map(({ keyword, country: itemCountry }) => ({ keyword, country: itemCountry }));
      const skipped: string[] = [];
      const payloads = buildKeywordAddPayloads({
         items: selectedItems,
         domain: domain?.domain || '',
         devices: addDevices,
         tags,
         location,
         country,
      }).filter((payload) => {
         if (trackedTargetLookup[fullTrackedKey(payload.keyword, payload.country, payload.device, normalizeLocation(payload.location))]) {
            skipped.push(`${payload.keyword} (${payload.device})`);
            return false;
         }
         return true;
      });
      addKeywords({ payloads, skipped });
      setSelectedKeywords([]);
      setShowAddStep(false);
   };

   const selectableKeywordIds = useMemo(() => {
      const keywordsForDevice = finalKeywords[device] || [];
      return keywordsForDevice
         .filter((keyword) => !trackedKeywordLookup[scTrackedKey(keyword.keyword, keyword.country, keyword.device)])
         .map((keyword) => keyword.uid);
   }, [finalKeywords, device, trackedKeywordLookup]);

   useEffect(() => {
      setSelectedKeywords((currentSelected) => {
         const filteredSelection = currentSelected.filter((id) => selectableKeywordIds.includes(id));
         return filteredSelection.length === currentSelected.length ? currentSelected : filteredSelection;
      });
   }, [selectableKeywordIds]);

   const selectedAllItems = selectableKeywordIds.length > 0 && selectedKeywords.length === selectableKeywordIds.length;

   const rowData: SCRowData = {
      items: finalKeywords[device] || [],
      selectedKeywords,
      selectKeyword,
      trackedKeywordLookup,
   };

   return (
      <div>
         <div className='domKeywords flex flex-col bg-[white] rounded-md text-sm border mb-4'>
            {selectedKeywords.length > 0 && (
               <div className='font-semibold text-sm py-4 px-8 text-gray-500 '>
                  <AddToTrackerBar
                     devices={addDevices}
                     setDevices={setAddDevices}
                     onAdd={openAddStep}
                     addDisabled={addDevices.length === 0}
                  />
               </div>
            )}
            {selectedKeywords.length === 0 && (
               <KeywordFilters
                  allTags={[]}
                  filterParams={filterParams}
                  filterKeywords={(params:KeywordFilters) => setFilterParams(params)}
                  updateSort={(sorted:string) => setSortBy(sorted)}
                  sortBy={sortBy}
                  keywords={keywords}
                  device={device}
                  setDevice={setDevice}
                  isConsole={true}
                  integratedConsole={isConsoleIntegrated}
                  SCcountries={Object.keys(SCCountryData)}
               />
            )}
            <div className='domkeywordsTable domkeywordsTable--sckeywords styled-scrollbar w-full overflow-auto min-h-[60vh]'>
               <div className=' lg:min-w-[800px]'>
                  <div className={`domKeywords_head domKeywords_head--${sortBy} hidden lg:flex p-3 px-6 bg-[#FCFCFF]
                   text-gray-600 justify-between items-center font-semibold border-y`}>
                     <span className='domKeywords_head_keyword flex-1 basis-20 w-auto '>
                     {finalKeywords[device].length > 0 && (
                        <button
                           className={`p-0 mr-2 leading-[0px] inline-block rounded-sm pt-0 px-[1px] pb-[3px]  border border-slate-300 
                           ${selectedAllItems ? ' bg-blue-700 border-blue-700 text-white' : 'text-transparent'}`}
                           onClick={() => setSelectedKeywords(selectedAllItems ? [] : selectableKeywordIds)}
                           >
                              <Icon type="check" size={10} />
                        </button>
                     )}
                        Keyword
                     </span>
                     <span className='domKeywords_head_position flex-1 basis-40 grow-0 text-center'>Position</span>
                     <span className='domKeywords_head_imp flex-1 text-center'>Impressions</span>
                     <span className='domKeywords_head_visits flex-1 text-center'>Visits</span>
                     <span className='domKeywords_head_ctr flex-1 text-center'>CTR</span>
                  </div>
                  <div className='domKeywords_keywords border-gray-200 min-h-[55vh] relative' data-domain={domain?.domain}>
                     {!isLoading && finalKeywords[device] && finalKeywords[device].length > 0 && (
                        <List
                        innerElementType="div"
                        itemData={rowData}
                        itemCount={finalKeywords[device].length}
                        itemSize={isMobile ? 100 : 57}
                        height={SCListHeight}
                        width={'100%'}
                        className={'styled-scrollbar'}
                        >
                           {SCKeywordRow}
                        </List>
                     )}
                     {!isLoading && finalKeywords[device] && (
                        <div className={`domKeywords_head hidden lg:flex p-3 px-6 bg-[#FCFCFF]
                           text-gray-600 justify-between items-center font-semibold border-y`}>
                              <span className='domKeywords_head_keyword flex-1 basis-20 w-auto font-semibold'>
                                 {finalKeywords[device].length} {device} Keywords
                              </span>
                              <span className='domKeywords_head_position flex-1 basis-40 grow-0 text-center'>{viewSummary.position}</span>
                              <span className='domKeywords_head_imp flex-1 text-center'>
                                 {formattedNum(viewSummary.impressions)}
                              </span>
                              <span className='domKeywords_head_visits flex-1 text-center'>
                                 {formattedNum(viewSummary.visits)}
                              </span>
                              <span className='domKeywords_head_ctr flex-1 text-center'>
                                 {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(viewSummary.ctr)}%
                              </span>
                        </div>
                     )}
                     {isConsoleIntegrated && !isLoading && finalKeywords[device].length === 0 && (
                        <p className=' p-9 pt-[10%] text-center text-gray-500'>
                           Could Not fetch Keyword Data for this Domain from Google Search Console.
                        </p>
                     )}
                     {isConsoleIntegrated && isLoading && (
                        <SpinnerMessage className='p-9 pt-[10%] text-center' label='Loading Search Console keywords' />
                     )}
                     {!isConsoleIntegrated && (
                        <p className=' p-9 pt-[10%] text-center text-gray-500'>
                        Google Search Console has not been Integrated yet. Please follow <a className='text-indigo-600 underline' href='https://docs.serpbear.com/miscellaneous/integrate-google-search-console' target="_blank" rel='noreferrer'>These Steps</a> to integrate Google Search Data for this Domain.
                        </p>
                     )}
                  </div>
               </div>
            </div>
         </div>
         {showAddStep && (
            <AddKeywordsMetaStep
               selectedCount={selectedKeywords.length}
               existingTags={existingTags}
               existingLocations={existingLocations}
               allowsCity={allowsCity}
               isAdding={isAddingKeywords}
               onConfirm={submitSCKeywordsToTracker}
               closeModal={() => setShowAddStep(false)}
            />
         )}
      </div>
   );
 };

 export default SCKeywordsTable;
