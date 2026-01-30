import { useRouter } from 'next/router';
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from 'react-query';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { useAddKeywords, useFetchKeywords } from '../../services/keywords';
import { useEmailKeywordIdeas } from '../../services/ideas';
import { formatLocation } from '../../utils/location';
import { getSelectedUntrackedKeywords } from '../../utils/client/helpers';
import Icon from '../common/Icon';
import SpinnerMessage from '../common/SpinnerMessage';
import KeywordIdea from './KeywordIdea';
import useWindowResize from '../../hooks/useWindowResize';
import useIsMobile from '../../hooks/useIsMobile';
import { IdeasSortKeywords, IdeasfilterKeywords } from '../../utils/client/sortFilter';
import IdeasFilters from './IdeasFilter';
import { useMutateFavKeywordIdeas } from '../../services/adwords';
import { ADWORDS_ENABLED, fetchDomains } from '../../services/domains';
import { DEVICE_DESKTOP, DEVICE_MOBILE } from '../../utils/constants';
import IdeaDetails from './IdeaDetails';
import SelectField from '../common/SelectField';
import toast from 'react-hot-toast';

// Extended IdeaKeyword type that includes precomputed tracking status
type IdeaKeywordWithTracking = IdeaKeyword & {
   isTracked: boolean;
};

type IdeasKeywordsTableProps = {
   domain: DomainType | null,
   keywords: IdeaKeyword[],
   favorites: IdeaKeyword[],
   noIdeasDatabase: boolean,
   isLoading: boolean,
   showFavorites: boolean,
   setShowFavorites: Function,
   isAdwordsIntegrated: boolean,
}

const IdeasKeywordsTable = ({
   domain, keywords = [], favorites = [], isLoading = true, isAdwordsIntegrated = true, setShowFavorites,
   showFavorites = false, noIdeasDatabase = false }: IdeasKeywordsTableProps) => {
   const router = useRouter();
   const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
   const [showKeyDetails, setShowKeyDetails] = useState<IdeaKeyword|null>(null);
   const [filterParams, setFilterParams] = useState<KeywordFilters>({ countries: [], tags: [], search: '' });
   const [sortBy, setSortBy] = useState<string>('imp_desc');
   const [listHeight, setListHeight] = useState(500);
   const [addKeywordDevice, setAddKeywordDevice] = useState<typeof DEVICE_DESKTOP | typeof DEVICE_MOBILE>(DEVICE_DESKTOP);
   const [addKeywordDomain, setAddKeywordDomain] = useState('');
   const { mutate: addKeywords } = useAddKeywords(() => { if (domain && domain.slug) router.push(`/domain/${domain.slug}`); });
   const { mutate: emailKeywordIdeas, isLoading: isEmailing } = useEmailKeywordIdeas(() => setSelectedKeywords([]));
   const { mutate: faveKeyword, isLoading: isFaving } = useMutateFavKeywordIdeas(router);
   const [isMobile] = useIsMobile();
   const isResearchPage = router.pathname === '/research';

   const trackedDomain = isResearchPage ? addKeywordDomain : (domain?.domain || '');
   const { keywordsData: trackedKeywordsData } = useFetchKeywords(router, trackedDomain);

   const trackedKeywordsList: KeywordType[] = useMemo(() => {
      if (Array.isArray(trackedKeywordsData)) {
         return trackedKeywordsData as KeywordType[];
      }
      return (trackedKeywordsData?.keywords || []) as KeywordType[];
   }, [trackedKeywordsData]);

   const trackedKeywordLookup = useMemo(() => {
      const lookup:Record<string, boolean> = {};
      trackedKeywordsList.forEach((trackedKeyword) => {
         const { keyword: trackedKeywordValue, country: trackedCountry, device: trackedDevice } = trackedKeyword;
         if (trackedKeywordValue && trackedCountry && trackedDevice) {
            lookup[`${trackedKeywordValue}:${trackedCountry}:${trackedDevice}`] = true;
         }
      });
      return lookup;
   }, [trackedKeywordsList]);

   const trackedDevicesToCheck = useMemo(() => {
       if (addKeywordDevice === DEVICE_DESKTOP || addKeywordDevice === DEVICE_MOBILE) {
          return [addKeywordDevice];
       }
       return [DEVICE_DESKTOP, DEVICE_MOBILE];
   }, [addKeywordDevice]);

   const isIdeaTracked = useCallback((idea: IdeaKeyword) => trackedDevicesToCheck.some((device) => trackedKeywordLookup[`${idea.keyword}:${idea.country}:${device}`]), [trackedDevicesToCheck, trackedKeywordLookup]);

   const { data: domainsData } = useQuery(
      ['domains', false],
      () => fetchDomains(router, false),
      { enabled: selectedKeywords.length > 0, retry: false },
   );
   const theDomains: DomainType[] = (domainsData && domainsData.domains) || [];

   useWindowResize(() => setListHeight(window.innerHeight - (isMobile ? 200 : 400)));

   const finalKeywords: IdeaKeywordWithTracking[] = useMemo(() => {
      const filteredKeywords = IdeasfilterKeywords(showFavorites ? favorites : keywords, filterParams);
      const sortedKeywords = IdeasSortKeywords(filteredKeywords, sortBy);
      // Compute isTracked status once for each keyword to follow DRY principle
      return sortedKeywords.map(keyword => ({
         ...keyword,
         isTracked: isIdeaTracked(keyword),
      }));
   }, [keywords, showFavorites, favorites, filterParams, sortBy, isIdeaTracked]);

   const selectableKeywordIds = useMemo(() => finalKeywords.filter((keyword) => !keyword.isTracked).map((keyword) => keyword.uid), [finalKeywords]);

   const favoriteIDs: string[] = useMemo(() => favorites.map((fav) => fav.uid), [favorites]);

   const allTags:string[] = useMemo(() => {
      const wordTags: Map<string, number> = new Map();
      keywords.forEach((k) => {
         const keywordsArray = k.keyword.split(' ');
         const keywordFirstTwoWords = keywordsArray.slice(0, 2).join(' ');
         const keywordFirstTwoWordsReversed = keywordFirstTwoWords.split(' ').reverse().join(' ');
         if (!wordTags.has(keywordFirstTwoWordsReversed)) {
            wordTags.set(keywordFirstTwoWords, 0);
         }
      });
      [...wordTags].forEach((tag) => {
         const foundTags = keywords.filter((kw) => kw.keyword.includes(tag[0]) || kw.keyword.includes(tag[0].split(' ').reverse().join(' ')));
         if (foundTags.length < 3) {
            wordTags.delete(tag[0]);
         } else {
            wordTags.set(tag[0], foundTags.length);
         }
      });
      const finalWordTags = [...wordTags].sort((a, b) => (a[1] > b[1] ? -1 : 1)).map((t) => `${t[0]} (${t[1]})`);
      return finalWordTags;
   }, [keywords]);

   const selectKeyword = (keywordID: string, isTrackedKeyword = false) => {
      if (isTrackedKeyword) { return; }
      let updatedSelected = [...selectedKeywords, keywordID];
      if (selectedKeywords.includes(keywordID)) {
         updatedSelected = selectedKeywords.filter((keyID) => keyID !== keywordID);
      }
      setSelectedKeywords(updatedSelected);
   };

   const favoriteKeyword = (keywordID: string) => {
      if (!ADWORDS_ENABLED) {
         return;
      }
      if (!isFaving) {
         faveKeyword({ keywordID, domain: isResearchPage ? 'research' : domain?.slug });
      }
   };

   const addKeywordIdeasToTracker = () => {
      if (isResearchPage && !addKeywordDomain) {
         toast('Please select a domain before adding keywords.', { icon: '⚠️' });
         return;
      }
      const selectedUntrackedKeywords = getSelectedUntrackedKeywords(finalKeywords, selectedKeywords);
      const selectedkeywords: KeywordAddPayload[] = selectedUntrackedKeywords.map((kitem) => {
         const { keyword, country } = kitem;
         return {
            keyword,
            device: addKeywordDevice,
            country,
            domain: isResearchPage ? addKeywordDomain : (domain?.domain || ''),
            tags: '',
            location: formatLocation({ country }),
         };
      });
      addKeywords(selectedkeywords);
      setSelectedKeywords([]);
   };

   const sendKeywordIdeasEmail = () => {
      const targetDomain = isResearchPage ? addKeywordDomain : (domain?.domain || '');
      if (!targetDomain) {
         toast('Please select a domain before emailing keywords.', { icon: '⚠️' });
         return;
      }
      const selectedIdeas = getSelectedUntrackedKeywords(finalKeywords, selectedKeywords);
      if (selectedIdeas.length === 0) {
         toast('Select at least one keyword idea to email.', { icon: '⚠️' });
         return;
      }
      emailKeywordIdeas({
         domain: targetDomain,
         keywords: selectedIdeas.map((idea) => ({
            keyword: idea.keyword,
            avgMonthlySearches: idea.avgMonthlySearches,
            monthlySearchVolumes: idea.monthlySearchVolumes,
            competition: idea.competition,
            competitionIndex: idea.competitionIndex,
         })),
      });
   };

   const selectedAllItems = selectableKeywordIds.length > 0 && selectedKeywords.length === selectableKeywordIds.length;

   const isDomainSelectionRequired = isResearchPage && !addKeywordDomain;
   const addButtonDisabled = isDomainSelectionRequired;
   const emailButtonDisabled = isEmailing;
   const emailButtonAriaDisabled = isDomainSelectionRequired;
   const selectionBannerText = isResearchPage ? 'Select Domain For Action' : 'Add Keywords to Tracker';

   const Row = ({ data, index, style }:ListChildComponentProps) => {
      const keyword: IdeaKeywordWithTracking = data[index];
      return (
         <KeywordIdea
         key={keyword.uid}
         style={style}
         selected={selectedKeywords.includes(keyword.uid)}
         selectKeyword={selectKeyword}
         favoriteKeyword={() => favoriteKeyword(keyword.uid)}
         showKeywordDetails={() => setShowKeyDetails(keyword)}
         isFavorite={favoriteIDs.includes(keyword.uid)}
         keywordData={keyword}
         lastItem={index === (finalKeywords.length - 1)}
         isTracked={keyword.isTracked}
         />
      );
   };

   let keywordsContent: JSX.Element | null = null;
   if (!isLoading && finalKeywords && finalKeywords.length > 0) {
      if (isMobile) {
         keywordsContent = (
            <div className='block sm:hidden'>
               {finalKeywords.map((keyword, index) => (
                  <KeywordIdea
                     key={keyword.uid}
                     style={{}}
                     selected={selectedKeywords.includes(keyword.uid)}
                     selectKeyword={selectKeyword}
                     favoriteKeyword={() => favoriteKeyword(keyword.uid)}
                     showKeywordDetails={() => setShowKeyDetails(keyword)}
                     isFavorite={favoriteIDs.includes(keyword.uid)}
                     keywordData={keyword}
                     lastItem={index === (finalKeywords.length - 1)}
                     isTracked={keyword.isTracked}
                  />
               ))}
            </div>
         );
      } else {
         keywordsContent = (
            <div className='hidden sm:block'>
               <List
               innerElementType="div"
               itemData={finalKeywords}
               itemCount={finalKeywords.length}
               itemSize={isMobile ? 100 : 57}
               height={listHeight}
               width={'100%'}
               className={'styled-scrollbar'}
               >
                  {Row}
               </List>
            </div>
         );
      }
   } else {
      keywordsContent = (
         <>
            {isAdwordsIntegrated && isLoading && (
               <SpinnerMessage className='p-9 pt-[10%] text-center' label='Loading keyword ideas' />
            )}
            {isAdwordsIntegrated && noIdeasDatabase && !isLoading && (
               <p className=' p-9 pt-[10%] text-center text-gray-500'>
                  {'No keyword Ideas has been generated for this domain yet. Click the "Load Ideas" button to generate keyword ideas.'}
               </p>
            )}
            {isAdwordsIntegrated && !isLoading && finalKeywords.length === 0 && !noIdeasDatabase && (
               <p className=' p-9 pt-[10%] text-center text-gray-500'>
                  {'No Keyword Ideas found. Please try generating Keyword Ideas again by clicking the "Load Ideas" button.'}
               </p>
            )}
            {!isAdwordsIntegrated && (
               <p className=' p-9 pt-[10%] text-center text-gray-500'>
                  Google Ads has not been Integrated yet. Please follow <a className='text-indigo-600 underline' href='https://docs.serpbear.com/miscellaneous/integrate-google-ads' target="_blank" rel='noreferrer'>These Steps</a> to integrate Google Ads.
               </p>
            )}
         </>
      );
   }
   return (
      <div>
         <div className='domKeywords flex flex-col bg-[white] rounded-md text-sm border mb-5'>
            {selectedKeywords.length > 0 && (
               <div className='font-semibold text-sm py-4 px-8 text-gray-500 '>
                  <div className={`inline-block ${isResearchPage ? ' mr-2' : ''}`}>{selectionBannerText}</div>
                  {isResearchPage && (
                     <SelectField
                     selected={[]}
                     options={theDomains.map((d) => ({ label: d.domain, value: d.domain }))}
                     defaultLabel={'Select a Domain'}
                     updateField={(updated:string[]) => updated[0] && setAddKeywordDomain(updated[0])}
                     emptyMsg="No Domains Found"
                     multiple={false}
                     inline={true}
                     rounded='rounded'
                     />
                  )}
                  <div className='inline-block ml-2'>
                     <button
                     className={`inline-block px-2 py-1 rounded-s
                     ${addKeywordDevice === DEVICE_DESKTOP ? 'bg-indigo-100 text-blue-700' : 'bg-indigo-50 '}`}
                     onClick={() => setAddKeywordDevice(DEVICE_DESKTOP)}>
                        {addKeywordDevice === DEVICE_DESKTOP ? '◉' : '○'} Desktop
                     </button>
                     <button
                     className={`inline-block px-2 py-1 rounded-e ${addKeywordDevice === DEVICE_MOBILE ? 'bg-indigo-100 text-blue-700' : 'bg-indigo-50 '}`}
                     onClick={() => setAddKeywordDevice(DEVICE_MOBILE)}>
                        {addKeywordDevice === DEVICE_MOBILE ? '◉' : '○'} Mobile
                     </button>
                  </div>
                     <div className='inline-flex flex-wrap gap-2 items-center ml-4 mt-2 sm:mt-0'>
                        <button
                        type='button'
                     className={`text-white bg-blue-700 px-3 py-1 rounded font-semibold transition-colors ${addButtonDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
                        onClick={addKeywordIdeasToTracker}
                     aria-disabled={addButtonDisabled}
                     tabIndex={addButtonDisabled ? -1 : 0}
                        >
                           + Add Keywords
                        </button>
                        <button
                        type='button'
                     className={`text-white bg-indigo-600 px-3 py-1 rounded font-semibold transition-colors ${(emailButtonDisabled || emailButtonAriaDisabled) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-500'}`}
                        onClick={sendKeywordIdeasEmail}
                     disabled={emailButtonDisabled}
                     aria-disabled={emailButtonAriaDisabled}
                     tabIndex={emailButtonAriaDisabled ? -1 : 0}
                        >
                           Email Keywords
                        </button>
                     </div>
               </div>
            )}
            {selectedKeywords.length === 0 && (
               <IdeasFilters
                  allTags={allTags}
                  filterParams={filterParams}
                  filterKeywords={(params:KeywordFilters) => setFilterParams(params)}
                  updateSort={(sorted:string) => setSortBy(sorted)}
                  sortBy={sortBy}
                  keywords={keywords}
                  favorites={favorites}
                  showFavorites={(show:boolean) => { setShowFavorites(show); }}
               />
            )}
            <div className='domkeywordsTable domkeywordsTable--sckeywords styled-scrollbar w-full overflow-auto min-h-[60vh]'>
               <div className=' lg:min-w-[800px]'>
                  <div className={`domKeywords_head domKeywords_head--${sortBy} hidden sm:flex p-3 px-6 bg-[#FCFCFF]
                   text-gray-600 justify-between items-center font-semibold border-y`}>
                     <span className='domKeywords_head_keyword flex-1 basis-20 w-auto '>
                     {finalKeywords.length > 0 && (
                        <button
                           className={`p-0 mr-2 leading-[0px] inline-block rounded-sm pt-0 px-[1px] pb-[3px]  border border-slate-300 
                           ${selectedAllItems ? ' bg-blue-700 border-blue-700 text-white' : 'text-transparent'}`}
                           onClick={() => setSelectedKeywords(selectedAllItems ? [] : [...selectableKeywordIds])}
                           >
                              <Icon type="check" size={10} />
                       </button>
                     )}
                        Keyword
                     </span>
                     <span className='domKeywords_head_vol flex-1 text-center'>Monthly Search</span>
                     <span className='domKeywords_head_trend flex-1 text-center'>Search Trend</span>
                     <span className='domKeywords_head_competition flex-1 text-center'>Competition</span>
                  </div>
                  <div className='domKeywords_keywords border-gray-200 min-h-[55vh] relative' data-domain={domain?.domain}>
                     {keywordsContent}
                  </div>
               </div>
            </div>
         </div>
         {showKeyDetails && showKeyDetails.uid && (
            <IdeaDetails keyword={showKeyDetails} closeDetails={() => setShowKeyDetails(null)} />
         )}
      </div>
   );
 };

 export default IdeasKeywordsTable;
